import { NextResponse, type NextRequest } from "next/server";
import { getRequestSession, getServerSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import type { DashboardSession } from "@/lib/auth/session";

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

/**
 * Resolve the session against the database so that password changes, role changes and
 * deactivation take effect immediately (JWT sessionVersion must match).
 */
export async function getCurrentSession(req: NextRequest): Promise<DashboardSession | null> {
  return resolveSession(await getRequestSession(req));
}

/**
 * The signed-in user for server components (cookie read, same database checks as the API). The root layout
 * passes it to the client so the server HTML and the first client render agree on what the sidebar shows.
 * Never throws: any failure means "not signed in" and the client falls back to /api/auth/me.
 */
export async function getServerUser(): Promise<{ email: string; role: DashboardSession["role"] } | null> {
  try {
    const session = await resolveSession(await getServerSession());
    return session ? { email: session.email, role: session.role } : null;
  } catch {
    return null;
  }
}

async function resolveSession(session: DashboardSession | null): Promise<DashboardSession | null> {
  if (!session) return null;

  if (session.teamMemberId) {
    const member = await prisma.teamMember.findUnique({
      where: { id: session.teamMemberId },
      select: { role: true, isActive: true, sessionVersion: true, email: true },
    });
    if (!member?.isActive || member.sessionVersion !== session.sessionVersion) return null;
    return { ...session, email: member.email, role: member.role };
  }

  const owner = await prisma.dashboardOwner.findUnique({
    where: { email: session.email },
    select: { sessionVersion: true },
  });
  if (!owner || owner.sessionVersion !== session.sessionVersion) return null;
  return { ...session, role: "ADMIN" };
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
