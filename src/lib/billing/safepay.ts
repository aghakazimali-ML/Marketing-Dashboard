import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * Safepay (Pakistan) client, implemented from the official @sfpy/node-sdk:
 *  - POST {api}/order/v1/init {client, amount, currency, environment} -> data.token (the "tracker")
 *  - customer pays at {checkout}/pay?beacon=<token>&order_id=…&redirect_url=…&cancel_url=…&env=…&webhooks=true
 *  - redirect back carries `tracker` + `sig`, sig = HMAC-SHA256(v1 secret, tracker) hex
 *  - webhook header `x-sfpy-signature` = HMAC-SHA512(webhook secret, JSON.stringify(body.data)) hex
 */
export type SafepayEnv = "sandbox" | "production";

const API: Record<SafepayEnv, string> = {
  sandbox: "https://sandbox.api.getsafepay.com",
  production: "https://api.getsafepay.com",
};
const CHECKOUT: Record<SafepayEnv, string> = {
  sandbox: "https://sandbox.api.getsafepay.com/checkout/pay",
  production: "https://getsafepay.com/checkout/pay",
};

/** Hosts can only be overridden in sandbox (for local mocks); production always uses Safepay's real hosts. */
function apiBase(cfg: SafepayConfig) {
  return cfg.env === "sandbox" && process.env.SAFEPAY_API_BASE_URL ? process.env.SAFEPAY_API_BASE_URL.replace(/\/$/, "") : API[cfg.env];
}
function checkoutBase(cfg: SafepayConfig) {
  return cfg.env === "sandbox" && process.env.SAFEPAY_CHECKOUT_BASE_URL ? process.env.SAFEPAY_CHECKOUT_BASE_URL.replace(/\/$/, "") : CHECKOUT[cfg.env];
}

export type SafepayConfig = {
  env: SafepayEnv;
  apiKey: string;
  secretKey: string;
  webhookSecret: string;
  /** "major" = whole rupees (default); "minor" = paisa. Confirm in the sandbox before going live. */
  amountUnit: "major" | "minor";
};

export function safepayConfig(env: NodeJS.ProcessEnv = process.env): SafepayConfig | null {
  const apiKey = env.SAFEPAY_API_KEY?.trim();
  const secretKey = env.SAFEPAY_SECRET_KEY?.trim();
  const webhookSecret = env.SAFEPAY_WEBHOOK_SECRET?.trim();
  if (!apiKey || !secretKey || !webhookSecret) return null;
  return {
    env: env.SAFEPAY_ENVIRONMENT?.trim() === "production" ? "production" : "sandbox",
    apiKey,
    secretKey,
    webhookSecret,
    amountUnit: env.SAFEPAY_AMOUNT_UNIT?.trim() === "minor" ? "minor" : "major",
  };
}

export function safepayConfigured() {
  return safepayConfig() !== null;
}

/** Amount in the unit Safepay expects. */
export function toSafepayAmount(amountPkr: number, unit: SafepayConfig["amountUnit"]): number {
  return unit === "minor" ? amountPkr * 100 : amountPkr;
}

function hexEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Verify the `sig` Safepay appends when redirecting the customer back after payment. */
export function verifyRedirectSignature(tracker: string, sig: string, secretKey: string): boolean {
  if (!tracker || !sig) return false;
  return hexEqual(sig, createHmac("sha256", secretKey).update(tracker).digest("hex"));
}

/** Verify a webhook. `data` is the parsed `data` object of the body (re-serialised exactly as Safepay's SDK does). */
export function verifyWebhookSignature(data: unknown, signatureHeader: string | null, webhookSecret: string): boolean {
  if (!signatureHeader || data === undefined) return false;
  const expected = createHmac("sha512", webhookSecret).update(Buffer.from(JSON.stringify(data))).digest("hex");
  return hexEqual(signatureHeader.trim(), expected);
}

export function signWebhookForTests(data: unknown, webhookSecret: string): string {
  return createHmac("sha512", webhookSecret).update(Buffer.from(JSON.stringify(data))).digest("hex");
}

export class SafepayError extends Error {}

/** Create a payment tracker for an order. Returns the beacon token. */
export async function initTracker(cfg: SafepayConfig, amountPkr: number): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${apiBase(cfg)}/order/v1/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: cfg.apiKey,
        amount: toSafepayAmount(amountPkr, cfg.amountUnit),
        currency: "PKR",
        environment: cfg.env,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SafepayError("Could not reach Safepay.");
  }
  if (!res.ok) {
    logger.warn("safepay init failed", { status: res.status, body: (await res.text().catch(() => "")).slice(0, 500) });
    throw new SafepayError(`Safepay rejected the payment request (${res.status}).`);
  }
  const json = (await res.json().catch(() => null)) as { data?: { token?: string } } | null;
  const token = json?.data?.token;
  if (!token) throw new SafepayError("Safepay did not return a payment token.");
  return token;
}

export function buildCheckoutUrl(
  cfg: SafepayConfig,
  p: { token: string; orderId: string; redirectUrl: string; cancelUrl: string }
): string {
  const q = new URLSearchParams({
    beacon: p.token,
    cancel_url: p.cancelUrl,
    env: cfg.env,
    order_id: p.orderId,
    redirect_url: p.redirectUrl,
    source: "custom",
    webhooks: "true",
  });
  return `${checkoutBase(cfg)}?${q.toString()}`;
}

export type SafepayNotification = {
  tracker: string | null;
  state: string | null;
  reference: string | null;
  orderId: string | null;
  amount: number | null;
};

/** Pull the fields we need out of a webhook `data` object, tolerating the documented shapes. */
export function readNotification(data: unknown): SafepayNotification {
  const d = (data ?? {}) as Record<string, unknown>;
  const n = ((d.notification as Record<string, unknown>) ?? d) as Record<string, unknown>;
  const meta = (n.metadata as Record<string, unknown>) ?? {};
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
  return {
    tracker: str(n.tracker) ?? str(d.tracker) ?? str(n.token),
    state: str(n.state) ?? str(d.state),
    reference: str(n.reference) ?? str(d.reference),
    orderId: str(meta.order_id) ?? str(n.order_id) ?? str(d.order_id),
    amount: num(n.amount) ?? num(d.amount),
  };
}

export const isPaidState = (state: string | null) => state?.toUpperCase() === "PAID";
export const isFailedState = (state: string | null) => ["FAILED", "CANCELLED", "CANCELED", "DECLINED", "EXPIRED"].includes(state?.toUpperCase() ?? "");
