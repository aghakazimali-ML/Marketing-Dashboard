import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { isPlanId, type PlanId } from "@/lib/billing/plans";
import { logger } from "@/lib/logger";

export type Interval = "month" | "year";

let client: Stripe | null = null;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe is not configured");
  client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}

const PRICE_ENV: Record<Exclude<PlanId, "FREE">, Record<Interval, string>> = {
  STARTER: { month: "STRIPE_PRICE_STARTER_MONTHLY", year: "STRIPE_PRICE_STARTER_YEARLY" },
  PRO: { month: "STRIPE_PRICE_PRO_MONTHLY", year: "STRIPE_PRICE_PRO_YEARLY" },
  EXCLUSIVE: { month: "STRIPE_PRICE_EXCLUSIVE_MONTHLY", year: "STRIPE_PRICE_EXCLUSIVE_YEARLY" },
};

export function priceIdFor(plan: PlanId, interval: Interval): string | null {
  if (plan === "FREE") return null;
  return process.env[PRICE_ENV[plan][interval]]?.trim() || null;
}

/** Reverse lookup: which plan does a Stripe price belong to? */
export function planForPriceId(priceId: string | null | undefined): { plan: PlanId; interval: Interval } | null {
  if (!priceId) return null;
  for (const [plan, byInterval] of Object.entries(PRICE_ENV)) {
    for (const interval of ["month", "year"] as const) {
      if (process.env[byInterval[interval]]?.trim() === priceId) return { plan: plan as PlanId, interval };
    }
  }
  return null;
}

function baseUrl() {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function ensureCustomer(email: string): Promise<string> {
  const ws = await prisma.workspace.findUnique({ where: { id: 1 } });
  if (ws?.stripeCustomerId) return ws.stripeCustomerId;
  const customer = await getStripe().customers.create({ email, metadata: { workspace: "1" } });
  await prisma.workspace.upsert({
    where: { id: 1 },
    create: { id: 1, stripeCustomerId: customer.id },
    update: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export async function createCheckoutUrl(opts: { email: string; plan: PlanId; interval: Interval }): Promise<string> {
  const price = priceIdFor(opts.plan, opts.interval);
  if (!price) throw new Error("This plan is not available for purchase yet.");
  const customer = await ensureCustomer(opts.email);
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    client_reference_id: "workspace-1",
    subscription_data: { metadata: { workspace: "1", plan: opts.plan } },
    success_url: `${baseUrl()}/billing?checkout=success`,
    cancel_url: `${baseUrl()}/billing?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalUrl(email: string): Promise<string> {
  const customer = await ensureCustomer(email);
  const session = await getStripe().billingPortal.sessions.create({
    customer,
    return_url: `${baseUrl()}/billing`,
  });
  return session.url;
}

/** Subset of a Stripe subscription that we persist. */
export type SubscriptionSnapshot = {
  id: string;
  customerId: string;
  status: string;
  priceId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export function snapshotFromSubscription(sub: Stripe.Subscription): SubscriptionSnapshot {
  const item = sub.items?.data?.[0];
  // current_period_end moved onto subscription items in newer API versions; support both.
  const end =
    (item as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  return {
    id: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    status: sub.status,
    priceId: item?.price?.id ?? null,
    currentPeriodEnd: end ? new Date(end * 1000) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
}

/** Persist a subscription's state. A price we do not recognise never upgrades the workspace. */
export async function applySubscription(snap: SubscriptionSnapshot) {
  const mapped = planForPriceId(snap.priceId);
  const ended = snap.status === "canceled" || snap.status === "incomplete_expired" || snap.status === "unpaid";
  const plan: PlanId = !ended && mapped && isPlanId(mapped.plan) ? mapped.plan : "FREE";
  if (!mapped) logger.warn("stripe subscription with unknown price", { priceId: snap.priceId });
  await prisma.workspace.upsert({
    where: { id: 1 },
    create: {
      id: 1, plan, planStatus: snap.status, billingProvider: "STRIPE", stripeCustomerId: snap.customerId, stripeSubscriptionId: snap.id,
      billingInterval: mapped?.interval ?? null, currentPeriodEnd: snap.currentPeriodEnd, cancelAtPeriodEnd: snap.cancelAtPeriodEnd,
    },
    update: {
      plan, planStatus: snap.status, stripeCustomerId: snap.customerId,
      billingProvider: ended ? null : "STRIPE",
      stripeSubscriptionId: ended ? null : snap.id,
      billingInterval: mapped?.interval ?? null, currentPeriodEnd: snap.currentPeriodEnd, cancelAtPeriodEnd: snap.cancelAtPeriodEnd,
    },
  });
  return plan;
}
