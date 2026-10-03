import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/authorization";
import { gateFeature } from "@/lib/billing/workspace";

/** Admin-only audit trail (plan feature). Cursor-paginated, newest first. */
export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;
  const gate = await gateFeature("auditLog");
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50));
  const cursor = sp.get("cursor");
  const action = sp.get("action");
  const rows = await prisma.auditLog.findMany({
    where: action && /^[a-z._]{3,40}$/.test(action) ? { action } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor && /^[a-z0-9]{10,40}$/i.test(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return NextResponse.json({
    entries: page.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      actor: r.actorEmail,
      role: r.actorRole,
      action: r.action,
      target: r.target,
      success: r.success,
      ip: r.ip,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
