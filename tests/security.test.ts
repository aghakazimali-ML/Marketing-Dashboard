import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/client-ip";
import { MemoryRateLimitStore, clearKey, isLimited, rateLimit, recordFailure, setRateLimitStore } from "@/lib/security/rate-limit";
import { safeNextPath } from "@/lib/auth/paths";
import { createSessionToken, hashPassword, SESSION_COOKIE } from "@/lib/auth/session";
import { getCurrentSession } from "@/lib/auth/authorization";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as forgot } from "@/app/api/auth/forgot/route";
import { POST as reset } from "@/app/api/auth/reset/route";
import { POST as changePassword } from "@/app/api/auth/password/route";
import { hashInviteToken } from "@/lib/auth/invites";
import { redact } from "@/lib/logger";
import { validateEnv } from "@/lib/config";
import { csvCell, safeSpreadsheetText } from "@/lib/security/sanitize";

const url = "http://localhost/api/x";
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

beforeEach(async () => {
  setRateLimitStore(new MemoryRateLimitStore());
  await prisma.passwordResetToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.dashboardOwner.deleteMany();
  delete process.env.SETUP_TOKEN;
  delete process.env.TRUST_PROXY;
});

describe("client IP (SEC-2)", () => {
  const req = (xff: string) => ({ headers: { get: (n: string) => (n === "x-forwarded-for" ? xff : null) } });
  it("ignores forwarding headers unless TRUST_PROXY is set", () => {
    expect(clientIp(req("6.6.6.6"), {} as NodeJS.ProcessEnv)).toBe("direct");
  });
  it("uses the right-most hop so a spoofed left entry cannot pick the bucket", () => {
    const env = { TRUST_PROXY: "true" } as unknown as NodeJS.ProcessEnv;
    expect(clientIp(req("1.1.1.1, 9.9.9.9"), env)).toBe("9.9.9.9");
    expect(clientIp(req("1.1.1.1, 9.9.9.9, 10.0.0.1"), { ...env, TRUST_PROXY_HOPS: "2" } as unknown as NodeJS.ProcessEnv)).toBe("9.9.9.9");
  });
  it("rejects non-IP values", () => {
    expect(clientIp(req("not-an-ip"), { TRUST_PROXY: "true" } as unknown as NodeJS.ProcessEnv)).toBe("unknown");
  });
});

describe("rate limit store", () => {
  it("blocks after the limit and can lock out by key", () => {
    expect(rateLimit("k", 2, 1000).ok).toBe(true);
    expect(rateLimit("k", 2, 1000).ok).toBe(true);
    expect(rateLimit("k", 2, 1000).ok).toBe(false);
    for (let i = 0; i < 10; i++) recordFailure("fail:a", 1000);
    expect(isLimited("fail:a", 10).ok).toBe(false);
    clearKey("fail:a");
    expect(isLimited("fail:a", 10).ok).toBe(true);
  });
});

describe("open redirect (SEC-5)", () => {
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/ok\nSet-Cookie:x"])("rejects %s", (v) => {
    expect(safeNextPath(v)).toBe("/");
  });
  it("keeps same-site paths with queries", () => {
    expect(safeNextPath("/reports?preset=last_7")).toBe("/reports?preset=last_7");
  });
});

describe("owner setup token (SEC-3)", () => {
  const body = { name: "Own", email: "own@x.com", password: "correct-horse-battery", setupToken: "tok-123456" };
  it("is locked when SETUP_TOKEN is not configured", async () => {
    expect((await signup(post("/api/auth/signup", body))).status).toBe(503);
    expect(await prisma.dashboardOwner.count()).toBe(0);
  });
  it("rejects a wrong token and accepts the right one", async () => {
    process.env.SETUP_TOKEN = "tok-123456";
    expect((await signup(post("/api/auth/signup", { ...body, setupToken: "wrong" }))).status).toBe(403);
    expect(await prisma.dashboardOwner.count()).toBe(0);
    expect((await signup(post("/api/auth/signup", body))).status).toBe(200);
    expect(await prisma.dashboardOwner.count()).toBe(1);
  });
});

async function makeOwner() {
  return prisma.dashboardOwner.create({ data: { id: 1, name: "Own", email: "own@x.com", passwordHash: await hashPassword("correct-horse-battery") } });
}

describe("login lockout", () => {
  it("locks an email after 10 failures even with the right password", async () => {
    await makeOwner();
    for (let i = 0; i < 10; i++) {
      expect((await login(post("/api/auth/login", { email: "own@x.com", password: "wrong-wrong-wrong" }))).status).toBe(401);
    }
    expect((await login(post("/api/auth/login", { email: "own@x.com", password: "correct-horse-battery" }))).status).toBe(429);
  });
  it("writes audit records for success and failure", async () => {
    await makeOwner();
    await login(post("/api/auth/login", { email: "own@x.com", password: "nope-nope-nope" }));
    await login(post("/api/auth/login", { email: "own@x.com", password: "correct-horse-battery" }));
    const actions = (await prisma.auditLog.findMany()).map((a) => a.action).sort();
    expect(actions).toEqual(["login.failure", "login.success"]);
  });
});

describe("session revocation (SEC-11)", () => {
  const withCookie = (token: string) => new NextRequest(url, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });

  it("invalidates old sessions when the password changes", async () => {
    await makeOwner();
    const token = await createSessionToken("own@x.com", "ADMIN", undefined, { sessionVersion: 0 });
    expect(await getCurrentSession(withCookie(token))).not.toBeNull();
    const res = await changePassword(
      new NextRequest("http://localhost/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ currentPassword: "correct-horse-battery", newPassword: "another-long-password" }),
      })
    );
    expect(res.status).toBe(200);
    expect(await getCurrentSession(withCookie(token))).toBeNull();
  });

  it("revokes a member's session on role change / disable", async () => {
    await makeOwner();
    const m = await prisma.teamMember.create({ data: { name: "M", email: "m@x.com", passwordHash: "x", role: "ADMIN" } });
    const token = await createSessionToken("m@x.com", "ADMIN", m.id, { sessionVersion: m.sessionVersion });
    expect((await getCurrentSession(withCookie(token)))?.role).toBe("ADMIN");
    await prisma.teamMember.update({ where: { id: m.id }, data: { role: "ANALYST", sessionVersion: { increment: 1 } } });
    expect(await getCurrentSession(withCookie(token))).toBeNull();
    const fresh = await createSessionToken("m@x.com", "ADMIN", m.id, { sessionVersion: 1 });
    expect((await getCurrentSession(withCookie(fresh)))?.role).toBe("ANALYST"); // role always comes from the DB
    await prisma.teamMember.update({ where: { id: m.id }, data: { isActive: false } });
    expect(await getCurrentSession(withCookie(fresh))).toBeNull();
  });
});

describe("password reset (SEC-10)", () => {
  async function requestToken() {
    await makeOwner();
    await forgot(post("/api/auth/forgot", { email: "own@x.com" }));
    // The token is only emailed, so mint an equivalent record for the test.
    const token = "t".repeat(43);
    await prisma.passwordResetToken.deleteMany();
    await prisma.passwordResetToken.create({ data: { subjectType: "OWNER", subjectId: "1", tokenHash: hashInviteToken(token), expiresAt: new Date(Date.now() + 30 * 60_000) } });
    return token;
  }

  it("answers identically for unknown and known emails", async () => {
    await makeOwner();
    const a = await (await forgot(post("/api/auth/forgot", { email: "own@x.com" }))).json();
    const b = await (await forgot(post("/api/auth/forgot", { email: "nobody@x.com" }))).json();
    expect(a).toEqual(b);
  });

  it("stores only a hash, works once, and revokes sessions", async () => {
    const token = await requestToken();
    const stored = await prisma.passwordResetToken.findFirst();
    expect(stored?.tokenHash).not.toContain(token);
    const old = await createSessionToken("own@x.com", "ADMIN", undefined, { sessionVersion: 0 });
    const ok = await reset(post("/api/auth/reset", { token, password: "brand-new-password-1" }));
    expect(ok.status).toBe(200);
    const again = await reset(post("/api/auth/reset", { token, password: "brand-new-password-2" }));
    expect(again.status).toBe(400);
    expect(await getCurrentSession(new NextRequest(url, { headers: { cookie: `${SESSION_COOKIE}=${old}` } }))).toBeNull();
    expect((await login(post("/api/auth/login", { email: "own@x.com", password: "brand-new-password-1" }))).status).toBe(200);
  });

  it("rejects expired tokens", async () => {
    const token = await requestToken();
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await reset(post("/api/auth/reset", { token, password: "brand-new-password-1" }))).status).toBe(400);
  });
});

describe("misc hygiene", () => {
  it("redacts credentials from log fields", () => {
    const out = redact({ accessToken: "abc", note: "Bearer abcdef.ghi", url: "https://x/y?access_token=SECRET&a=1", nested: { password: "p" } }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/abc|SECRET|"p"/);
  });
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toContain("'=");
    expect(safeSpreadsheetText("+1+1")).toBe("'+1+1");
  });
  it("production config requires strong secrets and an https base URL", () => {
    const weak = validateEnv({ NODE_ENV: "production", AUTH_SECRET: "short" } as unknown as NodeJS.ProcessEnv);
    expect(weak.ok).toBe(false);
    expect(weak.errors.join(" ")).toMatch(/AUTH_SECRET/);
    const strong = validateEnv({
      NODE_ENV: "production", AUTH_SECRET: "a".repeat(40), SECRETS_ENCRYPTION_KEY: "b".repeat(40),
      APP_BASE_URL: "https://dash.example.com", CRON_SECRET: "c".repeat(30),
    } as unknown as NodeJS.ProcessEnv);
    expect(strong.ok).toBe(true);
  });
});
