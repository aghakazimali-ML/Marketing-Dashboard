import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/authorization";
import { getUsage, getWorkspace } from "@/lib/billing/workspace";
import { getBrandName } from "@/lib/billing/brand";
import { safepayConfig } from "@/lib/billing/safepay";
import { lemonConfig, variantIdFor } from "@/lib/billing/lemonsqueezy";
import { currentPeriod, quotePurchase } from "@/lib/billing/payments";
import { resolveBillingContext } from "@/lib/billing/region";

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const [ws, usage, brandName, period, ctx] = await Promise.all([
    getWorkspace(), getUsage(), getBrandName(), currentPeriod(), resolveBillingContext(req),
  ]);
  const safepay = safepayConfig();
  const lemon = lemonConfig();
  const plans = ["STARTER", "PRO", "EXCLUSIVE"] as const;
  const intervals = ["month", "year"] as const;

  // What can be bought, by provider. Prices are fixed server-side; the client only renders them.
  const safepayQuotes = safepay
    ? Object.fromEntries(plans.map((p) => [p, Object.fromEntries(intervals.map((i) => [i, quotePurchase(period, p, i)]))]))
    : null;
  const lemonAvailable = lemon
    ? Object.fromEntries(plans.map((p) => [p, Object.fromEntries(intervals.map((i) => [i, Boolean(variantIdFor(p, i))]))]))
    : null;

  return NextResponse.json({
    plan: ws.plan,
    brandName,
    status: ws.status,
    source: ws.source,
    interval: ws.interval,
    currentPeriodEnd: ws.currentPeriodEnd,
    cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
    // True only while a Lemon Squeezy subscription is running; an expired one can be bought again.
    hasSubscription: ws.source === "lemonsqueezy",
    usage,
    billing: {
      // Detected from the visitor's IP: there is no country selector.
      region: ctx.region,
      country: ctx.country,
      currency: ctx.currency,
      provider: ctx.provider,
      locked: ctx.locked,
      safepay: safepay ? { environment: safepay.env, quotes: safepayQuotes } : null,
      lemonsqueezy: lemon ? { testMode: lemon.testMode, available: lemonAvailable } : null,
      configured: ctx.provider === "SAFEPAY" ? Boolean(safepay) : Boolean(lemon),
      managedByLicense: ws.source === "license",
    },
  });
}
