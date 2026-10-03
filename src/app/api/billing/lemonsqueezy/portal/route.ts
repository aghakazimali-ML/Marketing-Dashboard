import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/authorization";
import { getWorkspace } from "@/lib/billing/workspace";
import { audit } from "@/lib/audit";

/** Returns the Lemon Squeezy customer-portal URL (card, invoices, cancel) for the current subscription. */
export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;
  const ws = await getWorkspace();
  if (!ws.portalUrl) return NextResponse.json({ error: "There is no subscription to manage yet." }, { status: 404 });
  await audit("billing.portal_opened", { req, actor: access.session });
  return NextResponse.json({ url: ws.portalUrl });
}
