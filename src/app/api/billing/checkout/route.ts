import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/authorization";
import { createCheckoutUrl, stripeConfigured, priceIdFor } from "@/lib/billing/stripe";
import { getWorkspace, licensedPlan } from "@/lib/billing/workspace";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/security/rate-limit";
import { logger, errorFields } from "@/lib/logger";

const schema = z.object({
  plan: z.enum(["STARTER", "PRO", "EXCLUSIVE"]),
  interval: z.enum(["month", "year"]),
});

export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const limit = rateLimit(`billing:${access.session.email}`, 10, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  if (licensedPlan()) {
    return NextResponse.json({ error: "This installation's plan is managed by its operator licence." }, { status: 409 });
  }
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Online payments are not configured on this installation." }, { status: 503 });
  }
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Choose a plan and billing interval." }, { status: 400 });
  if (!priceIdFor(body.data.plan, body.data.interval)) {
    return NextResponse.json({ error: "That plan is not available for purchase yet." }, { status: 503 });
  }
  const ws = await getWorkspace();
  if (ws.source === "stripe" && ws.hasStripeCustomer) {
    return NextResponse.json({ error: "You already have a subscription. Use Manage billing to change plans." }, { status: 409 });
  }

  try {
    const url = await createCheckoutUrl({ email: access.session.email, ...body.data });
    await audit("billing.checkout_started", { req, actor: access.session, target: `${body.data.plan}:${body.data.interval}` });
    return NextResponse.json({ url });
  } catch (e) {
    logger.error("checkout failed", errorFields(e));
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
