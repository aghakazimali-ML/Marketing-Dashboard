import { NextRequest, NextResponse } from "next/server";
import { applyPaidPayment, markPaymentFailed } from "@/lib/billing/payments";
import { isFailedState, isPaidState, readNotification, safepayConfig, verifyWebhookSignature } from "@/lib/billing/safepay";
import { audit } from "@/lib/audit";
import { logger, errorFields } from "@/lib/logger";

/**
 * Safepay webhook. Authenticated by the `x-sfpy-signature` header (HMAC-SHA512 of the `data` object),
 * not by a session. Applying a payment is idempotent, so retries and duplicates are harmless.
 */
export async function POST(req: NextRequest) {
  const cfg = safepayConfig();
  if (!cfg) return NextResponse.json({ error: "Safepay is not configured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { data?: unknown } | null;
  if (!body || body.data === undefined || !verifyWebhookSignature(body.data, req.headers.get("x-sfpy-signature"), cfg.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const n = readNotification(body.data);
  if (!n.tracker) return NextResponse.json({ received: true, ignored: "no tracker" });

  try {
    if (isPaidState(n.state)) {
      const result = await applyPaidPayment({ tracker: n.tracker }, { reference: n.reference, reportedAmount: n.amount, unit: cfg.amountUnit });
      if (result.applied) {
        await audit("billing.payment_completed", { target: result.plan, meta: { provider: "SAFEPAY", via: "webhook", tracker: n.tracker } });
      } else if (result.reason === "amount_mismatch") {
        await audit("billing.payment_rejected", { target: n.tracker, success: false, meta: { reason: "amount mismatch", reported: n.amount } });
        return NextResponse.json({ error: "Amount mismatch" }, { status: 422 });
      }
    } else if (isFailedState(n.state)) {
      await markPaymentFailed({ tracker: n.tracker }, n.state?.toUpperCase().startsWith("CANCEL") ? "CANCELLED" : "FAILED");
      await audit("billing.payment_failed", { target: n.tracker, success: false, meta: { state: n.state } });
    }
  } catch (e) {
    logger.error("safepay webhook handler failed", errorFields(e));
    return NextResponse.json({ error: "Handler failed" }, { status: 500 }); // Safepay retries
  }
  return NextResponse.json({ received: true });
}
