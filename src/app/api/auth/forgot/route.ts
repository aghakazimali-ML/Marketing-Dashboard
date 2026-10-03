import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { findAccountByEmail } from "@/lib/auth/accounts";
import { hashInviteToken } from "@/lib/auth/invites";
import { audit } from "@/lib/audit";
import { sendPasswordResetEmail } from "@/lib/email/alerts";
import { clientIp } from "@/lib/security/client-ip";
import { rateLimit } from "@/lib/security/rate-limit";

const schema = z.object({ email: z.email().max(254) });
export const RESET_TTL_MS = 30 * 60_000;

/** Always answers the same way so the endpoint cannot be used to discover accounts. */
const GENERIC = { ok: true, message: "If an account exists for that email, a reset link has been sent." };

export async function POST(req: NextRequest) {
  const ipLimit = rateLimit(`forgot-ip:${clientIp(req)}`, 10, 60 * 60_000);
  if (!ipLimit.ok) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } });
  }
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const email = body.data.email.trim().toLowerCase();
  const emailLimit = rateLimit(`forgot-email:${email}`, 3, 60 * 60_000);
  if (!emailLimit.ok) return NextResponse.json(GENERIC); // silent: don't reveal throttling per account

  const account = await findAccountByEmail(email);
  if (account?.isActive) {
    const token = randomBytes(32).toString("base64url");
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { subjectType: account.kind, subjectId: account.id, usedAt: null } }),
      prisma.passwordResetToken.create({
        data: {
          subjectType: account.kind,
          subjectId: account.id,
          tokenHash: hashInviteToken(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      }),
    ]);
    const base = (process.env.APP_BASE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
    await sendPasswordResetEmail(account.email, `${base}/reset-password#token=${token}`);
    await audit("password.reset_requested", { req, target: account.email });
  }
  return NextResponse.json(GENERIC);
}
