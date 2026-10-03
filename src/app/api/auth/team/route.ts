import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/authorization";
import { audit } from "@/lib/audit";
import { getUsage, getWorkspace, planLimitResponse } from "@/lib/billing/workspace";

const updateSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(["ADMIN", "ANALYST"]).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => value.role !== undefined || value.isActive !== undefined);

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const [owner, members] = await Promise.all([
    prisma.dashboardOwner.findUnique({
      where: { id: 1 },
      select: { name: true, email: true, createdAt: true },
    }),
    prisma.teamMember.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    members: [
      ...(owner ? [{ ...owner, id: "owner", role: "ADMIN" as const, isActive: true, isOwner: true }] : []),
      ...members.map((member) => ({ ...member, isOwner: false })),
    ],
  });
}

export async function PATCH(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.id === "owner") {
    return NextResponse.json({ error: "Invalid team member update" }, { status: 400 });
  }

  const { id, ...data } = parsed.data;
  if (
    access.session.teamMemberId === id &&
    (data.role === "ANALYST" || data.isActive === false)
  ) {
    return NextResponse.json(
      { error: "You cannot remove your own administrator access." },
      { status: 409 }
    );
  }

  if (data.isActive === true) {
    const [ws, usage, current] = await Promise.all([getWorkspace(), getUsage(), prisma.teamMember.findUnique({ where: { id }, select: { isActive: true } })]);
    const maxSeats = ws.plan.limits.seats;
    if (current && !current.isActive && maxSeats !== null && usage.seats >= maxSeats) {
      return planLimitResponse("seats", maxSeats, ws.plan.name);
    }
  }

  try {
    // Role/activation changes revoke that member's existing sessions immediately.
    const member = await prisma.teamMember.update({
      where: { id },
      data: { ...data, sessionVersion: { increment: 1 } },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (data.role !== undefined) await audit("member.role_changed", { req, actor: access.session, target: member.email, meta: { role: data.role } });
    if (data.isActive !== undefined) await audit(data.isActive ? "member.enabled" : "member.disabled", { req, actor: access.session, target: member.email });
    return NextResponse.json({ member });
  } catch {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }
}