import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getRequestSession } from "@/lib/auth/server";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getRequestSession(req);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  if (session) await audit("logout", { req, actor: { email: session.email, role: session.role } });
  return res;
}
