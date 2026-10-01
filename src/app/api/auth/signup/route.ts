import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TeamRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword, createSessionToken, isAuthConfigured, setSessionCookie } from "@/lib/auth/session";
import { hashInviteToken } from "@/lib/auth/invites";
import { rateLimit } from "@/lib/security/rate-limit";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254),
  password: z.string().min(12).max(128),
  inviteToken: z.string().min(32).max(128).optional(),
});

class InviteUnavailableError extends Error {}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthConfigured()) {
      return NextResponse.json(
        { error: "Authentication is not configured. Set AUTH_SECRET in .env." },
        { status: 503 }
      );
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limit = rateLimit(`signup:${clientIp}`, 5, 60 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many setup attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
      );
    }

    const body = signupSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json(
        { error: "Enter your name, a valid email, and a password of at least 12 characters." },
        { status: 400 }
      );
    }

    const existingOwner = await prisma.dashboardOwner.findUnique({
      where: { id: 1 },
      select: { id: true },
    });
    if (!existingOwner && body.data.inviteToken) {
      return NextResponse.json(
        { error: "Complete owner setup before accepting team invitations." },
        { status: 400 }
      );
    }

    const email = body.data.email.trim().toLowerCase();
    const passwordHash = await hashPassword(body.data.password);

    if (!existingOwner) {
      const owner = await prisma.dashboardOwner.create({
        data: { name: body.data.name, email, passwordHash },
        select: { email: true },
      });
      const token = await createSessionToken(owner.email, "ADMIN");
      const response = NextResponse.json({ ok: true, email: owner.email, role: "ADMIN" });
      setSessionCookie(response, token);
      return response;
    }

    const inviteToken = body.data.inviteToken;
    if (!inviteToken) {
      return NextResponse.json(
        { error: "An administrator invitation is required to join this installation." },
        { status: 403 }
      );
    }

    const tokenHash = hashInviteToken(inviteToken);
    const now = new Date();
    const invite = await prisma.teamInvite.findUnique({ where: { tokenHash } });
    if (
      !invite ||
      invite.acceptedAt ||
      invite.expiresAt <= now ||
      invite.email.toLowerCase() !== email
    ) {
      return NextResponse.json({ error: "Invitation link is invalid or expired." }, { status: 400 });
    }

    const member = await prisma.$transaction(async (tx) => {
      const currentInvite = await tx.teamInvite.findUnique({ where: { tokenHash } });
      if (
        !currentInvite ||
        currentInvite.acceptedAt ||
        currentInvite.expiresAt <= now ||
        currentInvite.email.toLowerCase() !== email
      ) {
        throw new InviteUnavailableError();
      }

      const createdMember = await tx.teamMember.create({
        data: {
          name: body.data.name,
          email,
          passwordHash,
          role: currentInvite.role as TeamRole,
        },
      });
      const accepted = await tx.teamInvite.updateMany({
        where: { id: currentInvite.id, acceptedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      });
      if (accepted.count !== 1) throw new InviteUnavailableError();
      return createdMember;
    });

    const sessionToken = await createSessionToken(member.email, member.role, member.id);
    const response = NextResponse.json({ ok: true, email: member.email, role: member.role });
    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    if (error instanceof InviteUnavailableError) {
      return NextResponse.json({ error: "Invitation link is invalid or expired." }, { status: 409 });
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "An account already exists for this email or invitation." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Account setup is temporarily unavailable." }, { status: 500 });
  }
}