import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { gateFeature } from "@/lib/billing/workspace";
import { resolveRequestRange } from "@/lib/metrics/request";
import { buildReport } from "@/lib/reports/build";
import { rateLimit } from "@/lib/security/rate-limit";

/** Read-only API: GET /api/v1/overview?preset=last_30   (Authorization: Bearer mdk_…) */
export async function GET(req: NextRequest) {
  const key = await authenticateApiKey(req.headers.get("authorization"));
  if (!key) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  const limit = rateLimit(`api:${key.id}`, 120, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  const gate = await gateFeature("apiAccess");
  if (!gate.ok) return gate.response;

  const { range } = await resolveRequestRange(Object.fromEntries(req.nextUrl.searchParams));
  const report = await buildReport(range, { includePosts: true });
  return NextResponse.json({
    period: { label: range.label, start: range.start.toISOString(), end: range.end.toISOString() },
    kpi: report.kpi,
    kpiPlatforms: report.kpiPlatforms,
    website: report.website,
    topPosts: report.topPosts.map((p) => ({ title: p.title, platform: p.platform, channel: p.channelName, publishedAt: p.publishedAt, engagement: p.engagement, permalink: p.permalink })),
  });
}
