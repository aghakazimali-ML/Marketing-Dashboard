import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/authorization";
import { findAccountByEmail, startSession } from "@/lib/auth/accounts";

/** Silent sliding refresh: valid sessions get a fresh 1h token, capped at 12h since sign-in. */
export async function POST(req: NextRequest) {
  const session = await getCurrentSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await findAccountByEmail(session.email);
  if (!account || !account.isActive || account.sessionVersion !== session.sessionVersion) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  await startSession(res, account, session.signedInAt);
  return res;
}
