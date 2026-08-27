import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  isAuthConfigured,
  verifyPassword,
} from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    if (!isAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            "Auth is not configured. Set AUTH_SECRET (16+) and DASHBOARD_PASSWORD (8+) in .env",
        },
        { status: 503 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      password?: string;
      username?: string;
    };

    if (!body.password || typeof body.password !== "string") {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const ok = await verifyPassword(body.password);
    if (!ok) {
      // Constant-ish delay against brute force
      await new Promise((r) => setTimeout(r, 400));
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const username = (body.username?.trim() || "admin").slice(0, 64);
    const token = await createSessionToken(username);
    const res = NextResponse.json({ ok: true, username });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
