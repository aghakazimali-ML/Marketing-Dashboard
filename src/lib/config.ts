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
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_STARTER_MONTHLY: optional,
  STRIPE_PRICE_STARTER_YEARLY: optional,
  STRIPE_PRICE_PRO_MONTHLY: optional,
  STRIPE_PRICE_PRO_YEARLY: optional,
  STRIPE_PRICE_EXCLUSIVE_MONTHLY: optional,
  STRIPE_PRICE_EXCLUSIVE_YEARLY: optional,
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
  if (env.RESEND_API_KEY && !env.INVITE_FROM_EMAIL)
    errors.push("INVITE_FROM_EMAIL is required when RESEND_API_KEY is set.");
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET)
    errors.push("STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set.");
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
  if (!result.ok) {
    const message = `Configuration error:\n - ${result.errors.join("\n - ")}`;
    throw new Error(message);
  }
}
