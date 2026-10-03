import { NextRequest, NextResponse } from "next/server";
import { runSync, SyncBusyError } from "@/lib/sync";
import { safeEqual } from "@/lib/auth/accounts";
import { audit } from "@/lib/audit";
import { getWorkspace } from "@/lib/billing/workspace";
import { logger, errorFields } from "@/lib/logger";

export const maxDuration = 300;

/**
 * Scheduled fetch. Call daily with:  curl -X POST -H "x-cron-secret: $CRON_SECRET" $APP_BASE_URL/api/cron/sync
 * (or "Authorization: Bearer $CRON_SECRET"). Overlapping runs are refused with 409.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  const provided =
    req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ws = await getWorkspace();
  if (!ws.plan.features.scheduledFetch) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Automatic fetch is not included in the current plan." });
  }

  try {
    const results = await runSync(undefined, { trigger: "cron" });
    await audit("sync.cron");
    return NextResponse.json({
      ok: true,
      results: results.map(({ platform, status, recordsUpserted, message }) => ({ platform, status, recordsUpserted, message })),
    });
  } catch (e) {
    if (e instanceof SyncBusyError) return NextResponse.json({ error: e.message }, { status: 409 });
    logger.error("cron sync failed", errorFields(e));
    return NextResponse.json({ error: "Scheduled fetch failed" }, { status: 500 });
  }
}
