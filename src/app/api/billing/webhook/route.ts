import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { applySubscription, getStripe, snapshotFromSubscription } from "@/lib/billing/stripe";
import { audit } from "@/lib/audit";
import { logger, errorFields } from "@/lib/logger";

/**
 * Stripe webhook. Authenticated by the Stripe signature, not by a session.
 * Events are processed at most once (StripeEvent table) so retries are harmless.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = req.headers.get("stripe-signature");
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const payload = await req.text(); // raw body is required for signature verification
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const plan = await applySubscription(snapshotFromSubscription(sub));
        await audit("billing.plan_changed", { target: plan, meta: { event: event.type, status: sub.status } });
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && typeof session.subscription === "string") {
          const sub = await getStripe().subscriptions.retrieve(session.subscription);
          const plan = await applySubscription(snapshotFromSubscription(sub));
          await audit("billing.plan_changed", { target: plan, meta: { event: event.type } });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) await prisma.workspace.updateMany({ where: { stripeCustomerId: customerId }, data: { planStatus: "past_due" } });
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // Let Stripe retry: forget that we saw this event.
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => undefined);
    logger.error("stripe webhook handler failed", { type: event.type, ...errorFields(e) });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
