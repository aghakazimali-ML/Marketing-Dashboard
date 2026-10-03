import { NextRequest, NextResponse } from "next/server";
import { applyLemonEvent } from "@/lib/billing/lemon-sync";
import { lemonConfig, parseWebhook, verifyWebhook } from "@/lib/billing/lemonsqueezy";
import { audit } from "@/lib/audit";
import { logger, errorFields } from "@/lib/logger";

/**
 * Lemon Squeezy webhook, authenticated by the `X-Signature` header (HMAC-SHA256 of the raw body).
 * Handlers mirror subscription state and ignore stale events, so retries and duplicates are harmless.
 */
export async function POST(req: NextRequest) {
  const cfg = lemonConfig();
  if (!cfg) return NextResponse.json({ error: "Lemon Squeezy is not configured" }, { status: 503 });

  const raw = await req.text(); // the signature covers the exact raw body
  if (!verifyWebhook(raw, req.headers.get("x-signature"), cfg.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const evt = parseWebhook(json);
  if (!evt) return NextResponse.json({ received: true, ignored: "no event" });

  try {
    const result = await applyLemonEvent(evt);
    if (result.applied) {
      await audit("billing.plan_changed", { target: result.plan, meta: { provider: "LEMONSQUEEZY", event: evt.event, status: result.status } });
    }
    return NextResponse.json({ received: true, applied: result.applied });
  } catch (e) {
    logger.error("lemonsqueezy webhook handler failed", errorFields(e));
    return NextResponse.json({ error: "Handler failed" }, { status: 500 }); // Lemon Squeezy retries
  }
}
