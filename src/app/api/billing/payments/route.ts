import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/authorization";

/** Payment history (invoices) for administrators. */
export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;
  const rows = await prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({
    payments: rows.map((p) => ({
      id: p.id, orderId: p.orderId, plan: p.plan, interval: p.interval, amountPkr: p.amountPkr,
      creditPkr: p.creditPkr, status: p.status, createdAt: p.createdAt, paidAt: p.paidAt, reference: p.reference,
    })),
  });
}
