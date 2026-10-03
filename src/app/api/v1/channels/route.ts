import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { gateFeature } from "@/lib/billing/workspace";
import { resolveRequestRange } from "@/lib/metrics/request";
import { SOCIAL_PLATFORMS } from "@/lib/reports/build";
import { getChannelMetricsForRange } from "@/lib/metrics/queries";
import { rateLimit } from "@/lib/security/rate-limit";

/** Per-channel metrics: GET /api/v1/channels?preset=last_30 */
export async function GET(req: NextRequest) {
  const key = await authenticateApiKey(req.headers.get("authorization"));
  if (!key) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  const limit = rateLimit(`api:${key.id}`, 120, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  const gate = await gateFeature("apiAccess");
  if (!gate.ok) return gate.response;

  const { range } = await resolveRequestRange(Object.fromEntries(req.nextUrl.searchParams));
  const rows = await getChannelMetricsForRange(SOCIAL_PLATFORMS, range);
  return NextResponse.json({
    period: { label: range.label, start: range.start.toISOString(), end: range.end.toISOString() },
    // null means the platform did not provide the metric.
    channels: rows.map(({ connectionStatus, ...r }) => ({ ...r, connection: connectionStatus })),
  });
}
