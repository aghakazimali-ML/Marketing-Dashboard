import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@/generated/prisma/client";
import { parseRangeParams } from "@/lib/metrics/params";
import {
  getChannelMetricsForRange,
  getPostsForRange,
  getWebsiteMetrics,
  withDeltas,
  rankBy,
} from "@/lib/metrics/queries";
import { compareMetric } from "@/lib/metrics/periods";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const range = parseRangeParams(sp);

  const socialPlatforms: Platform[] = [
    Platform.LINKEDIN,
    Platform.FACEBOOK,
    Platform.INSTAGRAM,
    Platform.YOUTUBE,
  ];

  const [social, website, posts] = await Promise.all([
    getChannelMetricsForRange(socialPlatforms, range),
    getWebsiteMetrics(range),
    getPostsForRange(range),
  ]);

  const currentCompared = withDeltas(social.current, social.previous);

  const byPlatform = socialPlatforms.map((p) => {
    const rows = currentCompared.filter((r) => r.platform === p);
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const engagement = rows.reduce((s, r) => s + r.engagement, 0);
    const followers = rows.reduce((s, r) => s + r.followers, 0);
    const newFollowers = rows.reduce((s, r) => s + r.newFollowers, 0);
    const clicks = rows.reduce((s, r) => s + r.clicks, 0);
    const reach = rows.reduce((s, r) => s + r.reach, 0);
    const prevRows = social.previous.filter((r) => r.platform === p);
    const prevEngagement = prevRows.reduce((s, r) => s + r.engagement, 0);
    return {
      platform: p,
      followers,
      newFollowers,
      impressions,
      engagement,
      clicks,
      reach,
      engagementRate:
        impressions > 0 ? Number(((engagement / impressions) * 100).toFixed(2)) : 0,
      deltas: {
        engagement: compareMetric(engagement, prevEngagement),
        followers: compareMetric(
          followers,
          prevRows.reduce((s, r) => s + r.followers, 0)
        ),
        impressions: compareMetric(
          impressions,
          prevRows.reduce((s, r) => s + r.impressions, 0)
        ),
      },
    };
  });

  const totals = {
    followers: byPlatform.reduce((s, p) => s + p.followers, 0),
    impressions: byPlatform.reduce((s, p) => s + p.impressions, 0),
    reach: byPlatform.reduce((s, p) => s + p.reach, 0),
    engagement: byPlatform.reduce((s, p) => s + p.engagement, 0),
    clicks: byPlatform.reduce((s, p) => s + p.clicks, 0),
    newFollowers: byPlatform.reduce((s, p) => s + p.newFollowers, 0),
  };
  const prevTotals = {
    followers: social.previous.reduce((s, r) => s + r.followers, 0),
    impressions: social.previous.reduce((s, r) => s + r.impressions, 0),
    reach: social.previous.reduce((s, r) => s + r.reach, 0),
    engagement: social.previous.reduce((s, r) => s + r.engagement, 0),
    clicks: social.previous.reduce((s, r) => s + r.clicks, 0),
    newFollowers: social.previous.reduce((s, r) => s + r.newFollowers, 0),
  };

  const avgEngagementRate =
    totals.impressions > 0
      ? Number(((totals.engagement / totals.impressions) * 100).toFixed(2))
      : 0;
  const prevAvgEr =
    prevTotals.impressions > 0
      ? (prevTotals.engagement / prevTotals.impressions) * 100
      : 0;

  const bestPlatform = rankBy(byPlatform, (p) => p.engagementRate)[0];
  const linkedin = currentCompared.filter((r) => r.platform === Platform.LINKEDIN);
  const bestLinkedIn = rankBy(linkedin, (r) => r.engagementRate)[0];
  const topPost = rankBy(posts, (p) => p.engagement)[0];

  // Monthly trend for last 6 months from DB (LinkedIn aggregate impressions)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const liChannels = await prisma.channel.findMany({
    where: { platform: Platform.LINKEDIN },
    include: {
      snapshots: {
        where: { periodStart: { gte: sixMonthsAgo } },
        orderBy: { periodStart: "asc" },
      },
    },
  });

  const trendMap = new Map<string, { month: string; impressions: number; engagement: number }>();
  for (const ch of liChannels) {
    for (const s of ch.snapshots) {
      // Only include roughly monthly snapshots (span >= 20 days)
      const days =
        (s.periodEnd.getTime() - s.periodStart.getTime()) / (1000 * 60 * 60 * 24);
      if (days < 20) continue;
      const key = `${s.periodStart.getFullYear()}-${s.periodStart.getMonth()}`;
      const label = s.periodStart.toLocaleString("en", { month: "short" });
      const existing = trendMap.get(key) ?? { month: label, impressions: 0, engagement: 0 };
      existing.impressions += s.impressions;
      existing.engagement += s.engagement;
      trendMap.set(key, existing);
    }
  }

  return NextResponse.json({
    range: {
      label: range.label,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    totals: {
      ...totals,
      avgEngagementRate,
      websiteUsers: website.current.users,
      websiteSessions: website.current.sessions,
      deltas: {
        followers: compareMetric(totals.followers, prevTotals.followers),
        impressions: compareMetric(totals.impressions, prevTotals.impressions),
        reach: compareMetric(totals.reach, prevTotals.reach),
        engagement: compareMetric(totals.engagement, prevTotals.engagement),
        clicks: compareMetric(totals.clicks, prevTotals.clicks),
        newFollowers: compareMetric(totals.newFollowers, prevTotals.newFollowers),
        avgEngagementRate: compareMetric(avgEngagementRate, prevAvgEr),
        websiteUsers: website.deltas.users,
        websiteSessions: website.deltas.sessions,
      },
    },
    byPlatform,
    bestPlatform,
    bestLinkedIn,
    topPost,
    trend: Array.from(trendMap.values()),
  });
}
