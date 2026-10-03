import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TeamRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hashInviteToken } from "@/lib/auth/invites";
import { requireAdmin } from "@/lib/auth/authorization";
import { rateLimit } from "@/lib/security/rate-limit";
import { sendInvitationEmail } from "@/lib/email/invitations";
import { audit } from "@/lib/audit";
import { getUsage, getWorkspace, planLimitResponse } from "@/lib/billing/workspace";

const inviteSchema = z.object({
  email: z.email().max(254),
  role: z.enum(["ADMIN", "ANALYST"]),
});

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;
  const invites = await prisma.teamInvite.findMany({
    where: { acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, createdBy: true, expiresAt: true, createdAt: true },
  });
  return NextResponse.json({ invites });
}

export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const limit = rateLimit(`team-invite:${access.session.email}`, 20, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many invitations. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const parsed = inviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and role." }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const [owner, member] = await Promise.all([
    prisma.dashboardOwner.findUnique({ where: { id: 1 }, select: { email: true } }),
    prisma.teamMember.findUnique({ where: { email }, select: { id: true } }),
  ]);
  if (owner?.email === email || member) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  if (!owner) {
    return NextResponse.json({ error: "The installation owner account is missing." }, { status: 503 });
  }

  const [ws, usage] = await Promise.all([getWorkspace(), getUsage()]);
  const maxSeats = ws.plan.limits.seats;
  if (maxSeats !== null && usage.seats + usage.pendingInvites >= maxSeats) {
    return planLimitResponse("seats", maxSeats, ws.plan.name);
  }

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.teamInvite.updateMany({
    where: { email, acceptedAt: null },
    data: { expiresAt: now },
  });
  const invite = await prisma.teamInvite.create({
    data: {
      email,
      role: parsed.data.role as TeamRole,
      tokenHash: hashInviteToken(token),
      createdBy: access.session.email,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
    select: { id: true, email: true, role: true, expiresAt: true },
  });

  await audit("invite.created", { req, actor: access.session, target: invite.email, meta: { role: invite.role } });
  const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "") || req.nextUrl.origin;
  const inviteUrl = `${baseUrl}/signup#invite=${token}`;
  const delivery = await sendInvitationEmail({
    to: invite.email,
    ownerEmail: owner.email,
    role: invite.role,
    inviteUrl,
  });

  return NextResponse.json({
    invite,
    inviteUrl,
    emailSent: delivery.sent,
    emailMessage: delivery.message,
  }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Invite id required" }, { status: 400 });

  await prisma.teamInvite.updateMany({
    where: { id, acceptedAt: null },
    data: { expiresAt: new Date() },
  });
  await audit("invite.revoked", { req, actor: access.session, target: id });
  return NextResponse.json({ ok: true });
}