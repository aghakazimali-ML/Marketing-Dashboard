import { prisma } from "@/lib/db";
import { DASHBOARD_NAME } from "@/lib/brand";
import { getWorkspace } from "@/lib/billing/workspace";

/** Product name shown to users: the white-label name on plans that include it, else the default. */
export async function getBrandName(): Promise<string> {
  const ws = await getWorkspace();
  if (!ws.plan.features.whiteLabel) return DASHBOARD_NAME;
  const row = await prisma.workspace.findUnique({ where: { id: 1 }, select: { brandName: true } });
  return row?.brandName?.trim() || DASHBOARD_NAME;
}
