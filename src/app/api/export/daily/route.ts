import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/authorization";
import { gateFeature } from "@/lib/billing/workspace";
import { resolveRequestRange } from "@/lib/metrics/request";
import { rangeDays } from "@/lib/metrics/queries";
import { csvCell } from "@/lib/security/sanitize";

/** Raw per-day metrics for the selected range. Empty cells mean "not provided", never zero. */
export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const gate = await gateFeature("rawDataExport");
  if (!gate.ok) return gate.response;

  const { range } = await resolveRequestRange(Object.fromEntries(req.nextUrl.searchParams));
  const { startDay, endDay } = rangeDays(range);
  const [social, web] = await Promise.all([
    prisma.channelDailyMetric.findMany({
      where: { date: { gte: startDay, lte: endDay }, channel: { isActive: true } },
      include: { channel: { select: { name: true, platform: true } } },
      orderBy: [{ date: "asc" }, { channelId: "asc" }],
    }),
    prisma.websiteDailyMetric.findMany({
      where: { date: { gte: startDay, lte: endDay } },
      include: { channel: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
  ]);

  const c = csvCell;
  const lines = [
    "Date,Platform,Channel,Followers,New Followers,Impressions,Reach,Engagement,Likes,Comments,Shares,Clicks,Saves,Profile Visits,Video Views,Watch Time (min),Avg View Duration (s),Returning Viewers,Source",
    ...social.map((r) =>
      [r.date.toISOString().slice(0, 10), r.channel.platform, c(r.channel.name), c(r.followers), c(r.newFollowers), c(r.impressions), c(r.reach), c(r.engagement), c(r.likes), c(r.comments), c(r.shares), c(r.clicks), c(r.saves), c(r.profileVisits), c(r.videoViews), c(r.watchTimeMin), c(r.avgViewDurSec), c(r.returningViewers), c(r.source)].join(",")
    ),
    "",
    "Date,Property,Users,Sessions,New Users,Bounce Rate %,Avg Session Duration (s),Key Events,Source",
    ...web.map((r) =>
      [r.date.toISOString().slice(0, 10), c(r.channel.name), c(r.users), c(r.sessions), c(r.newUsers), c(r.bounceRate), c(r.avgSessionDurationSec), c(r.conversions), c(r.source)].join(",")
    ),
  ];
  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="daily-metrics.csv"' },
  });
}
