import { NextRequest, NextResponse } from "next/server";
import { applyPaidPayment } from "@/lib/billing/payments";
import { safepayConfig, verifyRedirectSignature } from "@/lib/billing/safepay";
import { audit } from "@/lib/audit";
import { logger, errorFields } from "@/lib/logger";

function backToBilling(req: NextRequest, status: "success" | "failed" | "cancelled") {
  const base = (process.env.APP_BASE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  // 303 so a POST from Safepay becomes a GET of the billing page.
  return NextResponse.redirect(`${base}/billing?checkout=${status}`, 303);
}

async function handle(req: NextRequest, params: URLSearchParams) {
  const cfg = safepayConfig();
  const tracker = params.get("tracker") ?? "";
  const sig = params.get("sig") ?? "";
  if (!cfg || !verifyRedirectSignature(tracker, sig, cfg.secretKey)) return backToBilling(req, "failed");

  try {
    const result = await applyPaidPayment({ tracker }, { reference: params.get("reference"), unit: cfg.amountUnit });
    if (result.applied) {
      await audit("billing.payment_completed", { target: result.plan, meta: { provider: "SAFEPAY", via: "redirect", tracker } });
      return backToBilling(req, "success");
    }
    // Already applied by the webhook counts as success for the customer.
    return backToBilling(req, result.reason === "already_paid" ? "success" : "failed");
  } catch (e) {
    logger.error("safepay return handler failed", errorFields(e));
    return backToBilling(req, "failed");
  }
}

/** Safepay sends the customer back with a form POST (or a GET): the signature, not a cookie, authenticates it. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const params = new URLSearchParams();
  form?.forEach((v, k) => typeof v === "string" && params.set(k, v));
  return handle(req, params);
}

export async function GET(req: NextRequest) {
  return handle(req, req.nextUrl.searchParams);
}
