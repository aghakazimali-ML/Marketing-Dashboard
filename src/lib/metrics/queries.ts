import { prisma } from "@/lib/db";
import type { Platform } from "@/generated/prisma/client";
import {
  type DateRange,
} from "@/lib/metrics/periods";

export type AggregatedChannelMetrics = {
  channelId: string;
  name: string;
  platform: Platform;
  handle: string | null;
  followers: number;
  newFollowers: number;
  impressions: number;
  reach: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  saves: number;
  profileVisits: number;
  videoViews: number;
  watchTimeMin: number;
  avgViewDurSec: number;
  returningViewers: number;
  postCount: number;
  engagementRate: number;
  ctr: number;
  growthPct: number;
};

function emptyAgg(
  channelId: string,
  name: string,
  platform: Platform,
  handle: string | null
): AggregatedChannelMetrics {
  return {
    channelId,
    name,
    platform,
    handle,
    followers: 0,
    newFollowers: 0,
    impressions: 0,
    reach: 0,
    engagement: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    clicks: 0,
    saves: 0,
    profileVisits: 0,
    videoViews: 0,
    watchTimeMin: 0,
    avgViewDurSec: 0,
    returningViewers: 0,
    postCount: 0,
    engagementRate: 0,
    ctr: 0,
    growthPct: 0,
  };
}

function overlaps(
  snapStart: Date,
  snapEnd: Date,
  rangeStart: Date,
  rangeEnd: Date
) {
  return snapStart <= rangeEnd && snapEnd >= rangeStart;
}

export async function getChannelMetricsForRange(
  platform: Platform | Platform[],
  range: DateRange
): Promise<AggregatedChannelMetrics[]> {
  const platforms = Array.isArray(platform) ? platform : [platform];
  const channels = await prisma.channel.findMany({
    where: { platform: { in: platforms }, isActive: true },
    include: { snapshots: true },
    orderBy: { name: "asc" },
  });

  function aggregate(
    start: Date,
    end: Date
  ): AggregatedChannelMetrics[] {
    return channels.map((ch) => {
      const snaps = ch.snapshots.filter((s) =>
        overlaps(s.periodStart, s.periodEnd, start, end)
      );
      const base = emptyAgg(ch.id, ch.name, ch.platform, ch.handle);
      if (snaps.length === 0) return base;

      // Prefer monthly-sized snapshots when available for longer ranges
      const sorted = [...snaps].sort(
        (a, b) => b.periodEnd.getTime() - a.periodEnd.getTime()
      );
      const latestFollowers = sorted[0]?.followers ?? 0;

      const sum = snaps.reduce(
        (acc, s) => {
          acc.newFollowers += s.newFollowers;
          acc.impressions += s.impressions;
          acc.reach += s.reach;
          acc.engagement += s.engagement;
          acc.likes += s.likes;
          acc.comments += s.comments;
          acc.shares += s.shares;
          acc.clicks += s.clicks;
          acc.saves += s.saves;
          acc.profileVisits += s.profileVisits;
          acc.videoViews += s.videoViews;
          acc.watchTimeMin += s.watchTimeMin;
          acc.returningViewers += s.returningViewers;
          acc.postCount += s.postCount;
          acc.avgViewDurSec += s.avgViewDurSec;
          return acc;
        },
        { ...base, followers: latestFollowers }
      );

      sum.avgViewDurSec = sum.avgViewDurSec / snaps.length;
      sum.engagementRate =
        sum.impressions > 0
          ? Number(((sum.engagement / sum.impressions) * 100).toFixed(2))
          : 0;
      sum.ctr =
        sum.impressions > 0
          ? Number(((sum.clicks / sum.impressions) * 100).toFixed(2))
          : 0;
      const prevFollowers = latestFollowers - sum.newFollowers;
      sum.growthPct =
        prevFollowers > 0
          ? Number(((sum.newFollowers / prevFollowers) * 100).toFixed(2))
          : 0;
      return sum;
    });
  }

  return aggregate(range.start, range.end);
}

export type ComparedRow = AggregatedChannelMetrics;

export async function getWebsiteMetrics(range: DateRange) {
  const snaps = await prisma.websiteSnapshot.findMany({
    orderBy: { periodEnd: "desc" },
  });

  function agg(start: Date, end: Date) {
    const matched = snaps.filter((s) =>
      overlaps(s.periodStart, s.periodEnd, start, end)
    );
    if (matched.length === 0) {
      return {
        users: 0,
        sessions: 0,
        newUsers: 0,
        bounceRate: 0,
        avgSessionDurationSec: 0,
        conversions: 0,
        goalCompletions: 0,
        trafficSources: [] as { source: string; users: number; sessions: number }[],
        topLandingPages: [] as { page: string; sessions: number; bounceRate: number }[],
      };
    }
    const totals = matched.reduce(
      (acc, s) => {
        acc.users += s.users;
        acc.sessions += s.sessions;
        acc.newUsers += s.newUsers;
        acc.conversions += s.conversions;
        acc.goalCompletions += s.goalCompletions;
        acc.bounceRate += s.bounceRate;
        acc.avgSessionDurationSec += s.avgSessionDurationSec;
        return acc;
      },
      {
        users: 0,
        sessions: 0,
        newUsers: 0,
        bounceRate: 0,
        avgSessionDurationSec: 0,
        conversions: 0,
        goalCompletions: 0,
      }
    );
    totals.bounceRate = totals.bounceRate / matched.length;
    totals.avgSessionDurationSec = totals.avgSessionDurationSec / matched.length;

    const latest = matched.sort(
      (a, b) => b.periodEnd.getTime() - a.periodEnd.getTime()
    )[0];

    return {
      ...totals,
      trafficSources: latest.trafficSources
        ? (JSON.parse(latest.trafficSources) as {
            source: string;
            users: number;
            sessions: number;
          }[])
        : [],
      topLandingPages: latest.topLandingPages
        ? (JSON.parse(latest.topLandingPages) as {
            page: string;
            sessions: number;
            bounceRate: number;
          }[])
        : [],
    };
  }

  return agg(range.start, range.end);
}

export async function getPostsForRange(range: DateRange, platform?: Platform) {
  const posts = await prisma.post.findMany({
    where: {
      publishedAt: { gte: range.start, lte: range.end },
      ...(platform ? { platform } : {}),
    },
    include: {
      channel: true,
      metrics: { orderBy: { syncedAt: "desc" }, take: 1 },
    },
    orderBy: { publishedAt: "desc" },
  });

  return posts.map((p) => {
    const m = p.metrics[0];
    return {
      id: p.id,
      title: p.title,
      content: p.content,
      thumbnailUrl: p.thumbnailUrl,
      platform: p.platform,
      channelName: p.channel.name,
      publishedAt: p.publishedAt,
      postType: p.postType,
      permalink: p.permalink,
      likes: m?.likes ?? 0,
      comments: m?.comments ?? 0,
      shares: m?.shares ?? 0,
      impressions: m?.impressions ?? 0,
      reach: m?.reach ?? 0,
      clicks: m?.clicks ?? 0,
      saves: m?.saves ?? 0,
      views: m?.views ?? 0,
      engagementRate: m?.engagementRate ?? 0,
      ctr: m?.ctr ?? 0,
      engagement: (m?.likes ?? 0) + (m?.comments ?? 0) + (m?.shares ?? 0),
    };
  });
}

export function rankBy<T>(
  rows: T[],
  getValue: (row: T) => number,
  direction: "desc" | "asc" = "desc"
): T[] {
  return [...rows].sort((a, b) =>
    direction === "desc" ? getValue(b) - getValue(a) : getValue(a) - getValue(b)
  );
}
