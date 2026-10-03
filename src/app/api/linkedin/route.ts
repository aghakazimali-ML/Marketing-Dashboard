import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/authorization";
import { Platform } from "@/generated/prisma/client";
import { resolveRequestRange } from "@/lib/metrics/request";
import { gateFeature } from "@/lib/billing/workspace";
import { getChannelMetricsForRange, getPostsForRange, leaderBy, rankBy } from "@/lib/metrics/queries";

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const { range, plan } = await resolveRequestRange(sp);
  const battleboard = sp.battleboard === "1";
  if (battleboard) {
    const gate = await gateFeature("battleboard");
    if (!gate.ok) return gate.response;
  }

  const rows = await getChannelMetricsForRange(Platform.LINKEDIN, range);
  const posts = plan.features.posts ? await getPostsForRange(range, Platform.LINKEDIN) : [];

  if (!battleboard) {
    return NextResponse.json({ rows, posts });
  }

  // A leader only exists if at least one page reported that metric; "best average" needs both inputs.
  const leaders = {
    engagementRate: leaderBy(rows, (r) => r.engagementRate),
    followerGrowth: leaderBy(rows, (r) => r.newFollowers),
    impressions: leaderBy(rows, (r) => r.impressions),
    clicks: leaderBy(rows, (r) => r.clicks),
    mostActive: leaderBy(rows, (r) => r.postCount),
    bestAverage: leaderBy(rows, (r) =>
      r.engagementRate !== null && r.impressions !== null ? r.engagementRate * Math.log10(r.impressions + 10) : null
    ),
  };

  const bestPost = leaderBy(posts, (p) => p.engagement);

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
