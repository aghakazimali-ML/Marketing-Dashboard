import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/authorization";
import { getUsage, getWorkspace } from "@/lib/billing/workspace";
import { stripeConfigured, priceIdFor } from "@/lib/billing/stripe";
import { PLAN_ORDER } from "@/lib/billing/plans";
import { getBrandName } from "@/lib/billing/brand";

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const [ws, usage, brandName] = await Promise.all([getWorkspace(), getUsage(), getBrandName()]);
  return NextResponse.json({
    plan: ws.plan,
    brandName,
    status: ws.status,
    source: ws.source,
    interval: ws.interval,
    currentPeriodEnd: ws.currentPeriodEnd,
    cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
    hasStripeCustomer: ws.hasStripeCustomer,
    usage,
    billing: {
      configured: stripeConfigured(),
      managedByLicense: ws.source === "license",
      purchasable: PLAN_ORDER.filter((p) => p !== "FREE").filter((p) => priceIdFor(p, "month") || priceIdFor(p, "year")),
    },
  });
}
