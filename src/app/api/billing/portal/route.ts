import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/authorization";
import { createPortalUrl, stripeConfigured } from "@/lib/billing/stripe";
import { audit } from "@/lib/audit";
import { logger, errorFields } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Online payments are not configured on this installation." }, { status: 503 });
  }
  try {
    const url = await createPortalUrl(access.session.email);
    await audit("billing.portal_opened", { req, actor: access.session });
    return NextResponse.json({ url });
  } catch (e) {
    logger.error("portal failed", errorFields(e));
    return NextResponse.json({ error: "Could not open the billing portal." }, { status: 502 });
  }
}
