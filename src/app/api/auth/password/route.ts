import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/authorization";
import {
  findAccountByEmail,
  passwordProblem,
  setPassword,
  startSession,
  verifyAgainst,
} from "@/lib/auth/accounts";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/security/rate-limit";

const schema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
});

/** Change your own password. Every other session is revoked; this one stays signed in. */
export async function POST(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  const limit = rateLimit(`pw-change:${access.session.email}`, 5, 15 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  }

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Enter your current and new password." }, { status: 400 });

  const problem = passwordProblem(body.data.newPassword);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (body.data.newPassword === body.data.currentPassword) {
    return NextResponse.json({ error: "Choose a password different from the current one." }, { status: 400 });
  }

  const account = await findAccountByEmail(access.session.email);
  if (!account || !(await verifyAgainst(account, body.data.currentPassword))) {
    await audit("password.changed", { req, actor: access.session, success: false });
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
  }

  const sessionVersion = await setPassword(account, body.data.newPassword);
  const res = NextResponse.json({ ok: true });
  await startSession(res, { ...account, sessionVersion });
  await audit("password.changed", { req, actor: access.session });
  return res;
}
