import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthConfigured } from "@/lib/auth/session";
import { findAccountByEmail, startSession, verifyAgainst } from "@/lib/auth/accounts";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/security/client-ip";
import { clearKey, isLimited, rateLimit, recordFailure } from "@/lib/security/rate-limit";

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

const WINDOW = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 10;
const MAX_ATTEMPTS_PER_IP = 30;

function tooMany(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too many sign-in attempts. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthConfigured()) {
      return NextResponse.json(
        { error: "Authentication is not configured. Set AUTH_SECRET in .env." },
        { status: 503 }
      );
    }

    const ip = clientIp(req);
    const ipLimit = rateLimit(`login-ip:${ip}`, MAX_ATTEMPTS_PER_IP, WINDOW);
    if (!ipLimit.ok) return tooMany(ipLimit.retryAfterSec);

    const body = loginSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: "Enter a valid email address and password." }, { status: 400 });
    }

    const email = body.data.email.trim().toLowerCase();
    const failKey = `login-fail:${email}`;
    const locked = isLimited(failKey, MAX_FAILURES_PER_EMAIL);
    if (!locked.ok) {
      await audit("login.locked", { req, target: email, success: false });
      return tooMany(locked.retryAfterSec);
    }

    const account = await findAccountByEmail(email);
    const valid = await verifyAgainst(account, body.data.password);
    if (!account || !account.isActive || !valid) {
      recordFailure(failKey, WINDOW);
      await audit("login.failure", { req, target: email, success: false });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    clearKey(failKey);
    const res = NextResponse.json({ ok: true, email: account.email, role: account.role });
    await startSession(res, account);
    await audit("login.success", { req, actor: { email: account.email, role: account.role } });
    return res;
  } catch {
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 500 });
  }
}
