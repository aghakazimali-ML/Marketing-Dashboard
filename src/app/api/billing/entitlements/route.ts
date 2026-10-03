import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/authorization";
import { getUsage, getWorkspace } from "@/lib/billing/workspace";
import { stripeConfigured, priceIdFor } from "@/lib/billing/stripe";
import { PLAN_ORDER } from "@/lib/billing/plans";
import { getBrandName } from "@/lib/billing/brand";
import { safepayConfig } from "@/lib/billing/safepay";
import { currentPeriod, quotePurchase } from "@/lib/billing/payments";

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const [ws, usage, brandName, period] = await Promise.all([getWorkspace(), getUsage(), getBrandName(), currentPeriod()]);
  const safepay = safepayConfig();
  const quotes = Object.fromEntries(
    (["STARTER", "PRO", "EXCLUSIVE"] as const).map((plan) => [
      plan,
      Object.fromEntries((["month", "year"] as const).map((i) => [i, quotePurchase(period, plan, i)])),
    ])
  );
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
      provider: safepay ? "SAFEPAY" : stripeConfigured() ? "STRIPE" : null,
      safepay: safepay ? { environment: safepay.env } : null,
      quotes: safepay ? quotes : null,
      configured: stripeConfigured() || Boolean(safepay),
      managedByLicense: ws.source === "license",
      purchasable: PLAN_ORDER.filter((p) => p !== "FREE").filter((p) => priceIdFor(p, "month") || priceIdFor(p, "year")),
    },
  });
}
