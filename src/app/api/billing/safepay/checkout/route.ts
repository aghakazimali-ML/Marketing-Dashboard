import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/authorization";
import { getWorkspace, licensedPlan } from "@/lib/billing/workspace";
import { currentPeriod, quotePurchase } from "@/lib/billing/payments";
import { buildCheckoutUrl, initTracker, safepayConfig, SafepayError } from "@/lib/billing/safepay";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/security/rate-limit";
import { logger, errorFields } from "@/lib/logger";

const schema = z.object({
  plan: z.enum(["STARTER", "PRO", "EXCLUSIVE"]),
  interval: z.enum(["month", "year"]),
});

/** Start a Safepay payment for a plan period. The price is always computed here, never taken from the client. */
export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const limit = rateLimit(`safepay-checkout:${access.session.email}`, 10, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  const cfg = safepayConfig();
  if (!cfg) return NextResponse.json({ error: "Online payments (Safepay) are not configured on this installation." }, { status: 503 });
  if (licensedPlan()) return NextResponse.json({ error: "This installation's plan is managed by its operator licence." }, { status: 409 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Choose a plan and billing period." }, { status: 400 });

  const ws = await getWorkspace();
  if (ws.source === "stripe") {
    return NextResponse.json({ error: "Your plan is billed through Stripe. Manage it from the billing portal." }, { status: 409 });
  }

  const quote = quotePurchase(await currentPeriod(), body.data.plan, body.data.interval);
  if (!quote.ok) return NextResponse.json({ error: quote.reason }, { status: 409 });

  const orderId = `ord_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const base = (process.env.APP_BASE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  try {
    const token = await initTracker(cfg, quote.amountPkr);
    await prisma.payment.create({
      data: {
        orderId,
        plan: body.data.plan,
        interval: body.data.interval,
        amountPkr: quote.amountPkr,
        creditPkr: quote.creditPkr,
        tracker: token,
        createdBy: access.session.email,
      },
    });
    const url = buildCheckoutUrl(cfg, {
      token,
      orderId,
      redirectUrl: `${base}/api/billing/safepay/return`,
      cancelUrl: `${base}/billing?checkout=cancelled`,
    });
    await audit("billing.checkout_started", {
      req,
      actor: access.session,
      target: `${body.data.plan}:${body.data.interval}`,
      meta: { provider: "SAFEPAY", orderId, amountPkr: quote.amountPkr, creditPkr: quote.creditPkr },
    });
    return NextResponse.json({ url, orderId, amountPkr: quote.amountPkr, creditPkr: quote.creditPkr });
  } catch (e) {
    logger.error("safepay checkout failed", errorFields(e));
    const message = e instanceof SafepayError ? e.message : "Could not start the payment. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
