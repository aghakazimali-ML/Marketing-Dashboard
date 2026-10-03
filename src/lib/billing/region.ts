import { detectCountry } from "@/lib/geo/country";
import { getWorkspace } from "@/lib/billing/workspace";

/**
 * Billing region, derived from the visitor's IP: Pakistan pays in PKR through Safepay, everyone else
 * pays in USD through Lemon Squeezy. There is deliberately no country picker.
 */
export type BillingRegion = "PK" | "INTL";
export type ProviderId = "SAFEPAY" | "LEMONSQUEEZY";

export const REGION_PROVIDER: Record<BillingRegion, ProviderId> = { PK: "SAFEPAY", INTL: "LEMONSQUEEZY" };
export const REGION_CURRENCY: Record<BillingRegion, "PKR" | "USD"> = { PK: "PKR", INTL: "USD" };

export function regionForCountry(country: string | null, env: NodeJS.ProcessEnv = process.env): BillingRegion {
  if (country) return country === "PK" ? "PK" : "INTL";
  // Unknown (local/private IP, geo API unavailable): the operator's default; this product is Pakistan-first.
  return env.DEFAULT_BILLING_REGION?.trim().toUpperCase() === "INTL" ? "INTL" : "PK";
}

export type BillingContext = {
  region: BillingRegion;
  country: string | null;
  currency: "PKR" | "USD";
  provider: ProviderId;
  /** True when the workspace already pays through a provider, so its IP no longer matters. */
  locked: boolean;
};

/**
 * Decide the provider for this request. A workspace that already pays through a provider keeps using
 * it (an admin travelling abroad must not be moved to another gateway); otherwise the IP decides.
 */
export async function resolveBillingContext(req: { headers: { get(name: string): string | null } }): Promise<BillingContext> {
  const [geo, ws] = await Promise.all([detectCountry(req), getWorkspace()]);
  if (ws.billingProvider === "SAFEPAY" || ws.billingProvider === "LEMONSQUEEZY") {
    const region: BillingRegion = ws.billingProvider === "SAFEPAY" ? "PK" : "INTL";
    return { region, country: geo.country, currency: REGION_CURRENCY[region], provider: ws.billingProvider, locked: true };
  }
  const region = regionForCountry(geo.country);
  return { region, country: geo.country, currency: REGION_CURRENCY[region], provider: REGION_PROVIDER[region], locked: false };
}
