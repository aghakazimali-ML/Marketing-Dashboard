import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingInterval, PlanId } from "@/lib/billing/plans";
import { logger } from "@/lib/logger";

/**
 * Lemon Squeezy (merchant of record) for international customers.
 *  - POST https://api.lemonsqueezy.com/v1/checkouts (JSON:API) -> data.attributes.url (hosted checkout)
 *  - webhooks: `X-Signature` = HMAC-SHA256(signing secret, raw body) hex; `meta.event_name`; `meta.custom_data`
 *  - subscription object: status, variant_id, renews_at, ends_at, urls.customer_portal, updated_at
 * Request/response shapes follow the official @lemonsqueezy/lemonsqueezy.js SDK.
 */
const API = "https://api.lemonsqueezy.com";

/** The API host can only be overridden in test mode (local mocks); live mode always uses the real host. */
function apiBase(cfg: LemonConfig) {
  return cfg.testMode && process.env.LEMONSQUEEZY_API_BASE_URL ? process.env.LEMONSQUEEZY_API_BASE_URL.replace(/\/$/, "") : API;
}

export type LemonConfig = {
  apiKey: string;
  storeId: string;
  webhookSecret: string;
  testMode: boolean;
};

export function lemonConfig(env: NodeJS.ProcessEnv = process.env): LemonConfig | null {
  const apiKey = env.LEMONSQUEEZY_API_KEY?.trim();
  const storeId = env.LEMONSQUEEZY_STORE_ID?.trim();
  const webhookSecret = env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim();
  if (!apiKey || !storeId || !webhookSecret) return null;
  return { apiKey, storeId, webhookSecret, testMode: env.LEMONSQUEEZY_TEST_MODE === "true" };
}

export function lemonConfigured() {
  return lemonConfig() !== null;
}

const VARIANT_ENV: Record<Exclude<PlanId, "FREE">, Record<BillingInterval, string>> = {
  STARTER: { month: "LEMONSQUEEZY_VARIANT_STARTER_MONTHLY", year: "LEMONSQUEEZY_VARIANT_STARTER_YEARLY" },
  PRO: { month: "LEMONSQUEEZY_VARIANT_PRO_MONTHLY", year: "LEMONSQUEEZY_VARIANT_PRO_YEARLY" },
  EXCLUSIVE: { month: "LEMONSQUEEZY_VARIANT_EXCLUSIVE_MONTHLY", year: "LEMONSQUEEZY_VARIANT_EXCLUSIVE_YEARLY" },
};

export function variantIdFor(plan: PlanId, interval: BillingInterval, env: NodeJS.ProcessEnv = process.env): string | null {
  if (plan === "FREE") return null;
  return env[VARIANT_ENV[plan][interval]]?.trim() || null;
}

/** Reverse lookup: which plan/interval does a Lemon Squeezy variant belong to? */
export function planForVariant(variantId: string | number | null | undefined, env: NodeJS.ProcessEnv = process.env): { plan: PlanId; interval: BillingInterval } | null {
  if (variantId === null || variantId === undefined) return null;
  const id = String(variantId);
  for (const [plan, byInterval] of Object.entries(VARIANT_ENV)) {
    for (const interval of ["month", "year"] as const) {
      if (env[byInterval[interval]]?.trim() === id) return { plan: plan as PlanId, interval };
    }
  }
  return null;
}

export class LemonError extends Error {}

/** Create a hosted checkout for a variant. Returns the checkout URL. */
export async function createCheckout(
  cfg: LemonConfig,
  p: { variantId: string; email: string; redirectUrl: string; custom: Record<string, string> }
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${apiBase(cfg)}/v1/checkouts`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: { email: p.email, custom: p.custom },
            product_options: { redirect_url: p.redirectUrl },
            ...(cfg.testMode ? { test_mode: true } : {}),
          },
          relationships: {
            store: { data: { type: "stores", id: cfg.storeId } },
            variant: { data: { type: "variants", id: p.variantId } },
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new LemonError("Could not reach Lemon Squeezy.");
  }
  if (!res.ok) {
    logger.warn("lemonsqueezy checkout failed", { status: res.status, body: (await res.text().catch(() => "")).slice(0, 500) });
    throw new LemonError(`Lemon Squeezy rejected the checkout request (${res.status}).`);
  }
  const json = (await res.json().catch(() => null)) as { data?: { attributes?: { url?: string } } } | null;
  const url = json?.data?.attributes?.url;
  if (!url) throw new LemonError("Lemon Squeezy did not return a checkout URL.");
  return url;
}

/** Verify the raw webhook body against the `X-Signature` header. */
export function verifyWebhook(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signature.trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signForTests(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export type SubscriptionSnapshot = {
  id: string;
  customerId: string | null;
  status: string;
  variantId: string | null;
  renewsAt: Date | null;
  endsAt: Date | null;
  cancelled: boolean;
  portalUrl: string | null;
  updatedAt: Date | null;
};

export type LemonWebhook = {
  event: string;
  custom: Record<string, unknown>;
  subscription: SubscriptionSnapshot | null;
};

const date = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
const idStr = (v: unknown) => (typeof v === "number" || (typeof v === "string" && v) ? String(v) : null);

export function parseWebhook(json: unknown): LemonWebhook | null {
  const o = json as { meta?: { event_name?: string; custom_data?: Record<string, unknown> }; data?: { type?: string; id?: unknown; attributes?: Record<string, unknown> } } | null;
  if (!o?.meta?.event_name) return null;
  const base = { event: o.meta.event_name, custom: o.meta.custom_data ?? {} };
  if (o.data?.type !== "subscriptions" || !o.data.attributes) return { ...base, subscription: null };
  const a = o.data.attributes;
  const urls = (a.urls as Record<string, unknown> | undefined) ?? {};
  return {
    ...base,
    subscription: {
      id: String(o.data.id),
      customerId: idStr(a.customer_id),
      status: String(a.status ?? ""),
      variantId: idStr(a.variant_id),
      renewsAt: date(a.renews_at),
      endsAt: date(a.ends_at),
      cancelled: a.cancelled === true,
      portalUrl: typeof urls.customer_portal === "string" ? urls.customer_portal : null,
      updatedAt: date(a.updated_at),
    },
  };
}
