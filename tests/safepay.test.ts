import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  buildCheckoutUrl, initTracker, readNotification, safepayConfig, signWebhookForTests,
  toSafepayAmount, verifyRedirectSignature, verifyWebhookSignature, type SafepayConfig,
} from "@/lib/billing/safepay";
import { addPeriod, amountMatches, applyPaidPayment, quotePurchase } from "@/lib/billing/payments";
import { getWorkspace } from "@/lib/billing/workspace";
import { pricePkr } from "@/lib/billing/plans";
import { POST as webhook } from "@/app/api/billing/safepay/webhook/route";
import { GET as safepayReturn, POST as safepayReturnPost } from "@/app/api/billing/safepay/return/route";
import { POST as checkout } from "@/app/api/billing/safepay/checkout/route";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/session";
import { digestDue, sendRenewalReminder } from "@/lib/reports/digest";

const cfg: SafepayConfig = { env: "sandbox", apiKey: "sec_key", secretKey: "v1-secret", webhookSecret: "wh-secret", amountUnit: "major" };

function setEnv() {
  process.env.SAFEPAY_API_KEY = cfg.apiKey;
  process.env.SAFEPAY_SECRET_KEY = cfg.secretKey;
  process.env.SAFEPAY_WEBHOOK_SECRET = cfg.webhookSecret;
  process.env.SAFEPAY_ENVIRONMENT = "sandbox";
  delete process.env.SAFEPAY_AMOUNT_UNIT;
  delete process.env.LICENSE_PLAN;
  process.env.APP_BASE_URL = "https://dash.example.com";
}

beforeEach(async () => {
  setEnv();
  await prisma.payment.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.dashboardOwner.deleteMany();
});
afterEach(() => vi.unstubAllGlobals());

const NOW = new Date("2026-10-10T10:00:00Z");

describe("signatures (from the official SDK)", () => {
  it("verifies the redirect signature: HMAC-SHA256(secret, tracker)", () => {
    const sig = createHmac("sha256", "v1-secret").update("track_abc").digest("hex");
    expect(verifyRedirectSignature("track_abc", sig, "v1-secret")).toBe(true);
    expect(verifyRedirectSignature("track_abd", sig, "v1-secret")).toBe(false);
    expect(verifyRedirectSignature("track_abc", "", "v1-secret")).toBe(false);
    expect(verifyRedirectSignature("track_abc", sig.slice(0, -2) + "00", "v1-secret")).toBe(false);
  });
  it("verifies the webhook signature: HMAC-SHA512(webhook secret, JSON data)", () => {
    const data = { notification: { tracker: "track_1", state: "PAID" } };
    const header = signWebhookForTests(data, "wh-secret");
    expect(verifyWebhookSignature(data, header, "wh-secret")).toBe(true);
    expect(verifyWebhookSignature({ ...data, extra: 1 }, header, "wh-secret")).toBe(false);
    expect(verifyWebhookSignature(data, header, "other-secret")).toBe(false);
    expect(verifyWebhookSignature(data, null, "wh-secret")).toBe(false);
  });
  it("reads the notification fields", () => {
    expect(readNotification({ notification: { tracker: "track_1", state: "PAID", reference: "r1", amount: 4999, metadata: { order_id: "ord_1" } } })).toEqual({
      tracker: "track_1", state: "PAID", reference: "r1", orderId: "ord_1", amount: 4999,
    });
  });
});

describe("Safepay client", () => {
  it("is only configured when all three secrets are present", () => {
    expect(safepayConfig()?.env).toBe("sandbox");
    delete process.env.SAFEPAY_WEBHOOK_SECRET;
    expect(safepayConfig()).toBeNull();
  });
  it("inits a tracker with the API key and whole-rupee amount, and builds the checkout url", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { token: "beacon_123" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const token = await initTracker(cfg, 4999);
    expect(token).toBe("beacon_123");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sandbox.api.getsafepay.com/order/v1/init");
    expect(JSON.parse(String(init.body))).toEqual({ client: "sec_key", amount: 4999, currency: "PKR", environment: "sandbox" });
    const link = new URL(buildCheckoutUrl(cfg, { token, orderId: "ord_1", redirectUrl: "https://x/r", cancelUrl: "https://x/c" }));
    expect(link.origin + link.pathname).toBe("https://sandbox.api.getsafepay.com/checkout/pay");
    expect(link.searchParams.get("beacon")).toBe("beacon_123");
    expect(link.searchParams.get("order_id")).toBe("ord_1");
    expect(link.searchParams.get("webhooks")).toBe("true");
    expect(toSafepayAmount(4999, "minor")).toBe(499900);
  });
  it("uses the production hosts in production", () => {
    expect(buildCheckoutUrl({ ...cfg, env: "production" }, { token: "t", orderId: "o", redirectUrl: "r", cancelUrl: "c" })).toContain("https://getsafepay.com/checkout/pay?");
  });
});

describe("pricing & periods", () => {
  const free = { plan: "FREE" as const, interval: null, periodEnd: null };
  it("charges the list price for a new purchase and never trusts client prices", () => {
    expect(quotePurchase(free, "PRO", "month", NOW)).toMatchObject({ ok: true, amountPkr: pricePkr("PRO", "month"), creditPkr: 0, kind: "new" });
    expect(quotePurchase(free, "FREE", "month", NOW).ok).toBe(false);
  });
  it("renews the same plan from the current end", () => {
    const end = new Date("2026-10-20T00:00:00Z");
    const q = quotePurchase({ plan: "PRO", interval: "month", periodEnd: end }, "PRO", "month", NOW);
    expect(q).toMatchObject({ ok: true, kind: "renewal", amountPkr: pricePkr("PRO", "month") });
    expect(q.ok && q.startsAt).toEqual(end);
  });
  it("credits unused days on an upgrade and refuses a downgrade while active", () => {
    const state = { plan: "STARTER" as const, interval: "month" as const, periodEnd: new Date("2026-10-25T10:00:00Z") }; // 15 days left
    const up = quotePurchase(state, "PRO", "month", NOW);
    const expectedCredit = Math.floor((pricePkr("STARTER", "month") / 30) * 15);
    expect(up).toMatchObject({ ok: true, kind: "upgrade", creditPkr: expectedCredit, amountPkr: pricePkr("PRO", "month") - expectedCredit });
    expect(quotePurchase({ ...state, plan: "PRO" }, "STARTER", "month", NOW).ok).toBe(false);
    // expired periods behave like a new purchase (downgrade allowed)
    expect(quotePurchase({ plan: "PRO", interval: "month", periodEnd: new Date("2026-10-01T00:00:00Z") }, "STARTER", "month", NOW)).toMatchObject({ ok: true, kind: "new" });
  });
  it("adds calendar months / years", () => {
    expect(addPeriod(new Date("2026-01-31T00:00:00Z"), "month").toISOString().slice(0, 7)).toBe("2026-02");
    expect(addPeriod(new Date("2026-10-10T00:00:00Z"), "year").toISOString().slice(0, 10)).toBe("2027-10-10");
  });
  it("matches reported amounts in the configured unit", () => {
    expect(amountMatches(4999, 4999, "major")).toBe(true);
    expect(amountMatches(4999, 499900, "minor")).toBe(true);
    expect(amountMatches(4999, 100, "major")).toBe(false);
    expect(amountMatches(4999, null, "major")).toBe(true);
  });
});

async function pending(over: Record<string, unknown> = {}) {
  return prisma.payment.create({ data: { orderId: `ord_${Math.random().toString(36).slice(2)}`, plan: "PRO", interval: "month", amountPkr: 12999, tracker: `track_${Math.random().toString(36).slice(2)}`, createdBy: "a@x.com", ...over } });
}

describe("applying a payment", () => {
  it("activates the plan for one period, exactly once", async () => {
    const p = await pending();
    const first = await applyPaidPayment({ tracker: p.tracker! }, { unit: "major" }, NOW);
    expect(first).toMatchObject({ applied: true, plan: "PRO" });
    const second = await applyPaidPayment({ tracker: p.tracker! }, { unit: "major" }, NOW);
    expect(second).toEqual({ applied: false, reason: "already_paid" });
    const ws = await prisma.workspace.findUnique({ where: { id: 1 } });
    expect(ws).toMatchObject({ plan: "PRO", billingProvider: "SAFEPAY", billingInterval: "month" });
    expect(ws!.currentPeriodEnd!.toISOString().slice(0, 10)).toBe("2026-11-10");
  });
  it("two concurrent confirmations extend the period only once", async () => {
    const p = await pending();
    const results = await Promise.all([1, 2, 3].map(() => applyPaidPayment({ tracker: p.tracker! }, { unit: "major" }, NOW)));
    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect((await prisma.workspace.findUnique({ where: { id: 1 } }))!.currentPeriodEnd!.toISOString().slice(0, 10)).toBe("2026-11-10");
  });
  it("stacks a renewal of the same plan on the remaining time", async () => {
    await applyPaidPayment({ tracker: (await pending()).tracker! }, { unit: "major" }, NOW);
    const later = new Date("2026-10-20T10:00:00Z");
    await applyPaidPayment({ tracker: (await pending()).tracker! }, { unit: "major" }, later);
    expect((await prisma.workspace.findUnique({ where: { id: 1 } }))!.currentPeriodEnd!.toISOString().slice(0, 10)).toBe("2026-12-10");
  });
  it("rejects a payment whose reported amount differs from the order", async () => {
    const p = await pending();
    expect(await applyPaidPayment({ tracker: p.tracker! }, { reportedAmount: 100, unit: "major" }, NOW)).toEqual({ applied: false, reason: "amount_mismatch" });
    expect((await prisma.payment.findUnique({ where: { id: p.id } }))!.status).toBe("PENDING");
    expect(await prisma.workspace.count()).toBe(0);
  });
  it("ignores unknown trackers", async () => {
    expect(await applyPaidPayment({ tracker: "track_nope" }, { unit: "major" })).toEqual({ applied: false, reason: "unknown" });
  });
  it("the plan lapses to Free after the period ends", async () => {
    await prisma.workspace.create({ data: { id: 1, plan: "PRO", billingProvider: "SAFEPAY", billingInterval: "month", currentPeriodEnd: new Date(Date.now() + 86_400_000) } });
    expect((await getWorkspace()).planId).toBe("PRO");
    await prisma.workspace.update({ where: { id: 1 }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    const ws = await getWorkspace();
    expect(ws.planId).toBe("FREE");
    expect(ws.status).toBe("expired");
  });
});

describe("webhook route", () => {
  const send = (data: unknown, header?: string | null) =>
    webhook(new NextRequest("http://localhost/api/billing/safepay/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", ...(header === null ? {} : { "x-sfpy-signature": header ?? signWebhookForTests(data, "wh-secret") }) },
      body: JSON.stringify({ data }),
    }));

  it("rejects bad or missing signatures without touching anything", async () => {
    const p = await pending();
    const data = { notification: { tracker: p.tracker, state: "PAID" } };
    expect((await send(data, "deadbeef")).status).toBe(400);
    expect((await send(data, null)).status).toBe(400);
    expect(await prisma.workspace.count()).toBe(0);
  });
  it("applies a PAID notification once and is safe to replay", async () => {
    const p = await pending();
    const data = { notification: { tracker: p.tracker, state: "PAID", reference: "ref_1", amount: 12999 } };
    expect((await send(data)).status).toBe(200);
    expect((await send(data)).status).toBe(200);
    expect((await getWorkspace()).planId).toBe("PRO");
    expect((await prisma.payment.findUnique({ where: { id: p.id } }))).toMatchObject({ status: "PAID", reference: "ref_1" });
    expect(await prisma.auditLog.count({ where: { action: "billing.payment_completed" } })).toBe(1);
  });
  it("rejects an amount mismatch (422) and marks failed notifications", async () => {
    const p = await pending();
    expect((await send({ notification: { tracker: p.tracker, state: "PAID", amount: 1 } })).status).toBe(422);
    expect((await getWorkspace()).planId).toBe("FREE");
    expect((await send({ notification: { tracker: p.tracker, state: "FAILED" } })).status).toBe(200);
    expect((await prisma.payment.findUnique({ where: { id: p.id } }))!.status).toBe("FAILED");
  });
});

describe("customer redirect route", () => {
  const sigFor = (t: string) => createHmac("sha256", "v1-secret").update(t).digest("hex");
  it("activates the plan from a correctly signed redirect (POST form and GET)", async () => {
    const p = await pending();
    const form = new URLSearchParams({ tracker: p.tracker!, sig: sigFor(p.tracker!), order_id: p.orderId });
    const res = await safepayReturnPost(new NextRequest("http://localhost/api/billing/safepay/return", { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded" } }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://dash.example.com/billing?checkout=success");
    expect((await getWorkspace()).planId).toBe("PRO");
    const again = await safepayReturn(new NextRequest(`http://localhost/api/billing/safepay/return?tracker=${p.tracker}&sig=${sigFor(p.tracker!)}`));
    expect(again.headers.get("location")).toContain("checkout=success"); // already applied by the first call
  });
  it("sends a forged redirect to the failed page and changes nothing", async () => {
    const p = await pending();
    const res = await safepayReturn(new NextRequest(`http://localhost/api/billing/safepay/return?tracker=${p.tracker}&sig=${"0".repeat(64)}`));
    expect(res.headers.get("location")).toContain("checkout=failed");
    expect((await getWorkspace()).planId).toBe("FREE");
  });
});

describe("checkout route", () => {
  async function adminCookie() {
    await prisma.dashboardOwner.create({ data: { id: 1, name: "O", email: "own@x.com", passwordHash: await hashPassword("correct-horse-battery") } });
    return `${SESSION_COOKIE}=${await createSessionToken("own@x.com", "ADMIN", undefined, { sessionVersion: 0 })}`;
  }
  const post = (cookie: string, body: unknown) =>
    checkout(new NextRequest("http://localhost/api/billing/safepay/checkout", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) }));

  it("requires an administrator", async () => {
    expect((await post("", { plan: "PRO", interval: "month" })).status).toBe(401);
  });
  it("creates a pending payment priced on the server and returns the Safepay URL", async () => {
    const cookie = await adminCookie();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { token: "beacon_xyz" } }), { status: 200 })));
    // a client-supplied amount is ignored (schema only allows plan + interval)
    const res = await post(cookie, { plan: "PRO", interval: "year", amount: 1 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.amountPkr).toBe(pricePkr("PRO", "year"));
    expect(new URL(json.url).searchParams.get("redirect_url")).toBe("https://dash.example.com/api/billing/safepay/return");
    const row = await prisma.payment.findFirst();
    expect(row).toMatchObject({ plan: "PRO", interval: "year", amountPkr: pricePkr("PRO", "year"), tracker: "beacon_xyz", status: "PENDING", createdBy: "own@x.com" });
  });
  it("refuses when Safepay is not configured or the plan is licensed", async () => {
    const cookie = await adminCookie();
    process.env.LICENSE_PLAN = "PRO";
    expect((await post(cookie, { plan: "EXCLUSIVE", interval: "month" })).status).toBe(409);
    delete process.env.LICENSE_PLAN;
    delete process.env.SAFEPAY_API_KEY;
    expect((await post(cookie, { plan: "EXCLUSIVE", interval: "month" })).status).toBe(503);
  });
});

describe("renewal reminder", () => {
  it("emails once when a prepaid period is within 7 days of ending", async () => {
    delete process.env.RESEND_API_KEY; // email not configured -> reason, nothing marked
    await prisma.dashboardOwner.create({ data: { id: 1, name: "O", email: "own@x.com", passwordHash: "x" } });
    await prisma.workspace.create({ data: { id: 1, plan: "PRO", billingProvider: "SAFEPAY", billingInterval: "month", currentPeriodEnd: new Date(NOW.getTime() + 3 * 86_400_000) } });
    expect((await sendRenewalReminder(NOW)).sent).toBe(false);
    process.env.RESEND_API_KEY = "re_test";
    process.env.INVITE_FROM_EMAIL = "x@example.com";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect((await sendRenewalReminder(NOW)).sent).toBe(true);
    expect((await sendRenewalReminder(NOW)).reason).toBe("already reminded");
    await prisma.workspace.update({ where: { id: 1 }, data: { currentPeriodEnd: new Date(NOW.getTime() + 20 * 86_400_000), renewalRemindedAt: null } });
    expect((await sendRenewalReminder(NOW)).reason).toBe("not due");
    expect(digestDue("NONE", null)).toBe(false);
    delete process.env.RESEND_API_KEY;
  });
});
