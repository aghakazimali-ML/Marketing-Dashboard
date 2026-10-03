import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: optional,
  AUTH_SECRET: optional,
  SECRETS_ENCRYPTION_KEY: optional,
  SETUP_TOKEN: optional,
  CRON_SECRET: optional,
  TRUST_PROXY: bool,
  APP_BASE_URL: optional,
  RESEND_API_KEY: optional,
  INVITE_FROM_EMAIL: optional,
  SYNC_LOOKBACK_DAYS: z.coerce.number().int().min(1).max(365).default(35),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // OAuth apps (optional; manual tokens still work)
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  META_APP_ID: optional,
  META_APP_SECRET: optional,
  LINKEDIN_CLIENT_ID: optional,
  LINKEDIN_CLIENT_SECRET: optional,
  // Billing (optional; without them the installation runs on the FREE plan)
  // Lemon Squeezy (international customers)
  LEMONSQUEEZY_API_KEY: optional,
  LEMONSQUEEZY_STORE_ID: optional,
  LEMONSQUEEZY_WEBHOOK_SECRET: optional,
  LEMONSQUEEZY_TEST_MODE: bool,
  LEMONSQUEEZY_VARIANT_STARTER_MONTHLY: optional,
  LEMONSQUEEZY_VARIANT_STARTER_YEARLY: optional,
  LEMONSQUEEZY_VARIANT_PRO_MONTHLY: optional,
  LEMONSQUEEZY_VARIANT_PRO_YEARLY: optional,
  LEMONSQUEEZY_VARIANT_EXCLUSIVE_MONTHLY: optional,
  LEMONSQUEEZY_VARIANT_EXCLUSIVE_YEARLY: optional,
  // Visitor-country detection (IP geolocation) and billing-region fallback
  GEOIP_URL: optional,
  GEOIP_API_KEY: optional,
  GEOIP_FORCE_COUNTRY: optional,
  DEFAULT_BILLING_REGION: z.enum(["PK", "INTL"]).optional(),
  // Safepay (Pakistan)
  SAFEPAY_ENVIRONMENT: z.enum(["sandbox", "production"]).optional(),
  SAFEPAY_API_KEY: optional,
  SAFEPAY_SECRET_KEY: optional,
  SAFEPAY_WEBHOOK_SECRET: optional,
  SAFEPAY_AMOUNT_UNIT: z.enum(["major", "minor"]).optional(),
});

export type Env = z.infer<typeof schema>;

/** Problems that must stop a production start. */
export function validateEnv(source: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(source);
  const errors: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    return { ok: false as const, errors, env: null };
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32)
      errors.push("AUTH_SECRET must be set to a random string of 32+ characters.");
    if (!env.SECRETS_ENCRYPTION_KEY || env.SECRETS_ENCRYPTION_KEY.length < 32)
      errors.push("SECRETS_ENCRYPTION_KEY must be set to a random string of 32+ characters.");
    if (!env.APP_BASE_URL?.startsWith("https://"))
      errors.push("APP_BASE_URL must be the public https:// URL of this installation.");
    if (!env.CRON_SECRET || env.CRON_SECRET.length < 24)
      errors.push("CRON_SECRET must be set (24+ characters) to enable scheduled fetches.");
  }
  if (env.NODE_ENV !== "test" && !env.DATABASE_URL?.match(/^postgres(ql)?:\/\//))
    errors.push("DATABASE_URL must be a PostgreSQL connection string (postgresql://user:password@host:5432/database).");
  if (env.RESEND_API_KEY && !env.INVITE_FROM_EMAIL)
    errors.push("INVITE_FROM_EMAIL is required when RESEND_API_KEY is set.");
  const safepay = [env.SAFEPAY_API_KEY, env.SAFEPAY_SECRET_KEY, env.SAFEPAY_WEBHOOK_SECRET];
  if (safepay.some(Boolean) && !safepay.every(Boolean))
    errors.push("Safepay needs SAFEPAY_API_KEY, SAFEPAY_SECRET_KEY and SAFEPAY_WEBHOOK_SECRET together.");
  const lemon = [env.LEMONSQUEEZY_API_KEY, env.LEMONSQUEEZY_STORE_ID, env.LEMONSQUEEZY_WEBHOOK_SECRET];
  if (lemon.some(Boolean) && !lemon.every(Boolean))
    errors.push("Lemon Squeezy needs LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID and LEMONSQUEEZY_WEBHOOK_SECRET together.");
  if (env.GEOIP_URL && !env.GEOIP_URL.includes("{ip}"))
    errors.push("GEOIP_URL must contain the {ip} placeholder.");
  if (env.NODE_ENV === "production" && env.GEOIP_FORCE_COUNTRY)
    errors.push("GEOIP_FORCE_COUNTRY is for testing only and must not be set in production.");
  return errors.length
    ? { ok: false as const, errors, env }
    : { ok: true as const, errors, env };
}

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const result = validateEnv();
  if (!result.env) throw new Error(`Invalid environment: ${result.errors.join("; ")}`);
  cached = result.env;
  return cached;
}

/** Fails fast with a readable message; called from instrumentation on server start. */
export function assertEnv() {
  const result = validateEnv();
  if (result.env?.NODE_ENV === "production" && result.env.SAFEPAY_API_KEY && result.env.SAFEPAY_ENVIRONMENT !== "production") {
    console.warn("[config] Safepay is in SANDBOX mode: set SAFEPAY_ENVIRONMENT=production to take real payments.");
  }
  if (!result.ok) {
    const message = `Configuration error:\n - ${result.errors.join("\n - ")}`;
    throw new Error(message);
  }
}
