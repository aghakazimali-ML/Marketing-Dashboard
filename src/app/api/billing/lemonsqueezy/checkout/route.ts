import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/authorization";
import { createCheckout, lemonConfig, LemonError, variantIdFor } from "@/lib/billing/lemonsqueezy";
import { resolveBillingContext } from "@/lib/billing/region";
import { getWorkspace, licensedPlan } from "@/lib/billing/workspace";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/security/rate-limit";
import { logger, errorFields } from "@/lib/logger";

const schema = z.object({
  plan: z.enum(["STARTER", "PRO", "EXCLUSIVE"]),
  interval: z.enum(["month", "year"]),
});

/** Start a Lemon Squeezy subscription checkout (international customers). The variant is chosen server-side. */
export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const limit = rateLimit(`lemon-checkout:${access.session.email}`, 10, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  const cfg = lemonConfig();
  if (!cfg) return NextResponse.json({ error: "International payments (Lemon Squeezy) are not configured on this installation." }, { status: 503 });
  if (licensedPlan()) return NextResponse.json({ error: "This installation's plan is managed by its operator licence." }, { status: 409 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Choose a plan and billing period." }, { status: 400 });

  const ctx = await resolveBillingContext(req);
  if (ctx.provider !== "LEMONSQUEEZY") {
    return NextResponse.json({ error: "Customers in Pakistan pay through Safepay in PKR." }, { status: 409 });
  }
  const ws = await getWorkspace();
  if (ws.source === "lemonsqueezy") {
    return NextResponse.json({ error: "You already have a subscription. Use Manage subscription to change plans." }, { status: 409 });
  }
  const variantId = variantIdFor(body.data.plan, body.data.interval);
  if (!variantId) return NextResponse.json({ error: "That plan is not available for purchase yet." }, { status: 503 });

  const base = (process.env.APP_BASE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  try {
    const url = await createCheckout(cfg, {
      variantId,
      email: access.session.email,
      redirectUrl: `${base}/billing?checkout=success`,
      // Lets the webhook prove the subscription belongs to this installation.
      custom: { workspace: "1", plan: body.data.plan, interval: body.data.interval },
    });
    await audit("billing.checkout_started", { req, actor: access.session, target: `${body.data.plan}:${body.data.interval}`, meta: { provider: "LEMONSQUEEZY" } });
    return NextResponse.json({ url });
  } catch (e) {
    logger.error("lemonsqueezy checkout failed", errorFields(e));
    return NextResponse.json({ error: e instanceof LemonError ? e.message : "Could not start checkout. Please try again." }, { status: 502 });
  }
}
