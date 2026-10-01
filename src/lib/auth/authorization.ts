import { NextResponse, type NextRequest } from "next/server";
import { getRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";

export async function requireUser(req: NextRequest) {
  const session = await getCurrentSession(req);
  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true as const, session };
}

export async function getCurrentSession(req: NextRequest) {
  const session = await getRequestSession(req);
  if (!session) return null;
  if (!session.teamMemberId) return session;

  const member = await prisma.teamMember.findUnique({
    where: { id: session.teamMemberId },
    select: { role: true, isActive: true },
  });
  if (!member?.isActive) return null;
  return { ...session, role: member.role };
}

export async function requireAdmin(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access;
  const { session } = access;
  if (session.role !== "ADMIN") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Administrator access required" }, { status: 403 }),
    };
  }
  return { ok: true as const, session };
}