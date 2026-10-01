import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/authorization";
import { Platform } from "@/generated/prisma/client";
import { parseRangeParams } from "@/lib/metrics/params";
import {
  getChannelMetricsForRange,
  getPostsForRange,
  rankBy,
} from "@/lib/metrics/queries";

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const range = parseRangeParams(sp);
  const battleboard = sp.battleboard === "1";

  const rows = await getChannelMetricsForRange(Platform.LINKEDIN, range);
  const posts = await getPostsForRange(range, Platform.LINKEDIN);

  if (!battleboard) {
    return NextResponse.json({ rows, posts });
  }

  const leaders = {
    engagementRate: rankBy(rows, (r) => r.engagementRate)[0],
    followerGrowth: rankBy(rows, (r) => r.newFollowers)[0],
    impressions: rankBy(rows, (r) => r.impressions)[0],
    clicks: rankBy(rows, (r) => r.clicks)[0],
    mostActive: rankBy(rows, (r) => r.postCount)[0],
    bestAverage: rankBy(rows, (r) => r.engagementRate * Math.log10(r.impressions + 10))[0],
  };

  const bestPost = rankBy(posts, (p) => p.engagement)[0];

  return NextResponse.json({
    rows,
    leaders,
    bestPost,
    rankings: {
      byEngagementRate: rankBy(rows, (r) => r.engagementRate),
      byGrowth: rankBy(rows, (r) => r.growthPct),
      byImpressions: rankBy(rows, (r) => r.impressions),
      byClicks: rankBy(rows, (r) => r.clicks),
      byActivity: rankBy(rows, (r) => r.postCount),
    },
  });
}
