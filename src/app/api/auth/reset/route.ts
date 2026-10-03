import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { findAccountById, passwordProblem, setPassword } from "@/lib/auth/accounts";
import { hashInviteToken } from "@/lib/auth/invites";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/security/client-ip";
import { rateLimit } from "@/lib/security/rate-limit";

const schema = z.object({ token: z.string().min(32).max(128), password: z.string().min(1).max(128) });

export async function POST(req: NextRequest) {
  const limit = rateLimit(`reset-ip:${clientIp(req)}`, 10, 15 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  }
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const problem = passwordProblem(body.data.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const tokenHash = hashInviteToken(body.data.token);
  const now = new Date();
  // Single use: the conditional update only succeeds for one caller.
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  const invalid = NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  if (claimed.count !== 1) return invalid;

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  const account = record ? await findAccountById(record.subjectType as "OWNER" | "MEMBER", record.subjectId) : null;
  if (!account || !account.isActive) return invalid;

  await setPassword(account, body.data.password);
  await prisma.passwordResetToken.deleteMany({ where: { subjectType: account.kind, subjectId: account.id } });
  await audit("password.reset_completed", { req, target: account.email });
  return NextResponse.json({ ok: true });
}
