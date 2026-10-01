import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  createSessionToken,
  isAuthConfigured,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  try {
    if (!isAuthConfigured()) {
      return NextResponse.json(
        { error: "Authentication is not configured. Set AUTH_SECRET in .env." },
        { status: 503 }
      );
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limit = rateLimit(`login:${clientIp}`, 10, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
      );
    }

    const body = loginSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json(
        { error: "Enter a valid email address and password." },
        { status: 400 }
      );
    }

    const email = body.data.email.trim().toLowerCase();
    const owner = await prisma.dashboardOwner.findUnique({ where: { email } });
    if (owner) {
      const ok = await verifyPassword(body.data.password, owner.passwordHash);
      if (!ok) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
      const token = await createSessionToken(email, "ADMIN");
      const res = NextResponse.json({ ok: true, email, role: "ADMIN" });
      setSessionCookie(res, token);
      return res;
    }

    const member = await prisma.teamMember.findUnique({ where: { email } });
    const memberPasswordIsValid = member
      ? await verifyPassword(body.data.password, member.passwordHash)
      : false;
    if (!member || !member.isActive || !memberPasswordIsValid) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = await createSessionToken(email, member.role, member.id);
    const res = NextResponse.json({ ok: true, email, role: member.role });
    setSessionCookie(res, token);
    return res;
  } catch {
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 500 });
  }
}
