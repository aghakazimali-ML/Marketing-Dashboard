import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashInviteToken } from "@/lib/auth/invites";

const tokenSchema = z.object({ token: z.string().min(32).max(128) });

export async function POST(req: NextRequest) {
  const body = tokenSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const invite = await prisma.teamInvite.findUnique({
    where: { tokenHash: hashInviteToken(body.data.token) },
    select: { email: true, role: true, expiresAt: true, acceptedAt: true },
  });
  const valid = Boolean(invite && !invite.acceptedAt && invite.expiresAt > new Date());
  return NextResponse.json(
    valid && invite ? { valid: true, email: invite.email, role: invite.role } : { valid: false },
    { status: valid ? 200 : 404 }
  );
}