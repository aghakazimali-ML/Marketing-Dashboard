import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth/accounts";
import { sendDueDigest, sendRenewalReminder } from "@/lib/reports/digest";
import { logger, errorFields } from "@/lib/logger";

/** Call daily (same secret as /api/cron/sync). Sends the email digest only when one is due. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const provided = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!provided || !safeEqual(provided, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const digest = await sendDueDigest();
    const renewal = await sendRenewalReminder();
    return NextResponse.json({ ok: true, ...digest, renewalReminder: renewal });
  } catch (e) {
    logger.error("digest failed", errorFields(e));
    return NextResponse.json({ error: "Digest failed" }, { status: 500 });
  }
}
