import { prisma } from "@/lib/db";
import type { Platform } from "@/generated/prisma/client";
import type { DateRange } from "@/lib/metrics/periods";
import { addDaysUtc, localDayToUtc } from "@/lib/metrics/dates";
import {
  aggregateChannelDays,
  aggregateWebsiteDays,
  postEngagement,
  round,
  sumNullable,
  type ChannelAggregate,
  type Metric,
} from "@/lib/metrics/aggregate";

export type AggregatedChannelMetrics = ChannelAggregate & {
  channelId: string;
  name: string;
  platform: Platform;
  handle: string | null;
  /** Date of the newest stored day in range, or null when nothing was stored. */
  lastDataDay: string | null;
  connectionStatus: "ACTIVE" | "NEEDS_RECONNECT";
};

export type ComparedRow = AggregatedChannelMetrics;

export function rangeDays(range: DateRange) {
  return { startDay: localDayToUtc(range.start), endDay: localDayToUtc(range.end) };
}

export async function getChannelMetricsForRange(
  platform: Platform | Platform[],
  range: DateRange
): Promise<AggregatedChannelMetrics[]> {
  const platforms = Array.isArray(platform) ? platform : [platform];
  const { startDay, endDay } = rangeDays(range);

  const channels = await prisma.channel.findMany({
    where: { platform: { in: platforms }, isActive: true },
    orderBy: { name: "asc" },
  });
  if (!channels.length) return [];
  const ids = channels.map((c) => c.id);

  const [days, before, postCounts] = await Promise.all([
    prisma.channelDailyMetric.findMany({
      where: { channelId: { in: ids }, date: { gte: startDay, lte: endDay } },
      orderBy: { date: "asc" },
    }),
    // Latest follower count recorded before the range, per channel.
    prisma.channelDailyMetric.findMany({
      where: { channelId: { in: ids }, date: { lt: startDay }, followers: { not: null } },
      orderBy: { date: "desc" },
      distinct: ["channelId"],
      select: { channelId: true, followers: true },
    }),
    prisma.post.groupBy({
      by: ["channelId"],
      where: {
        channelId: { in: ids },
        publishedAt: { gte: range.start, lte: range.end },
      },
      _count: { _all: true },
    }),
  ]);

  const postTotals = new Map(postCounts.map((p) => [p.channelId, p._count._all]));
  const channelsWithPosts = new Set(
    (await prisma.post.groupBy({ by: ["channelId"], where: { channelId: { in: ids } } })).map(
      (p) => p.channelId
    )
  );

  return channels.map((ch) => {
    const rows = days.filter((d) => d.channelId === ch.id);
    const prior = before.find((b) => b.channelId === ch.id)?.followers ?? null;
    const agg = aggregateChannelDays(ch.platform, rows, prior);
    // Post count comes from stored posts (null if no posts were ever fetched).
    agg.postCount = channelsWithPosts.has(ch.id) ? (postTotals.get(ch.id) ?? 0) : null;
    return {
      ...agg,
      channelId: ch.id,
      name: ch.name,
      platform: ch.platform,
      handle: ch.handle,
      lastDataDay: rows.length ? rows[rows.length - 1].date.toISOString().slice(0, 10) : null,
      connectionStatus: ch.connectionStatus,
    };
  });
}

export type WebsiteMetrics = {
  users: Metric;
  sessions: Metric;
  newUsers: Metric;
  bounceRate: Metric;
  avgSessionDurationSec: Metric;
  conversions: Metric;
  /** True when at least one website property is registered. */
  connected: boolean;
  trafficSources: { source: string; users: number | null; sessions: number | null }[];
  topLandingPages: { page: string; sessions: number | null; bounceRate: number | null }[];
};

export async function getWebsiteMetrics(range: DateRange): Promise<WebsiteMetrics> {
  const { startDay, endDay } = rangeDays(range);
  const [channels, days, breakdowns] = await Promise.all([
    prisma.channel.count({ where: { platform: "WEBSITE", isActive: true } }),
    prisma.websiteDailyMetric.findMany({
      where: { date: { gte: startDay, lte: endDay } },
      orderBy: { date: "asc" },
    }),
    prisma.websiteBreakdown.findMany({
      where: { date: { gte: startDay, lte: endDay } },
    }),
  ]);

  // Several properties on the same day add up before averaging.
  const byDate = new Map<number, typeof days>();
  for (const d of days) {
    const list = byDate.get(d.date.getTime()) ?? [];
    list.push(d);
    byDate.set(d.date.getTime(), list);
  }
  const merged = [...byDate.entries()].flatMap(([t, list]) => {
    if (list.length === 1) return [{ ...list[0], date: new Date(t) }];
    const agg = aggregateWebsiteDays(list.map((d) => ({ ...d, date: new Date(t) })));
    return [{ date: new Date(t), ...agg }];
  });
  const agg = aggregateWebsiteDays(merged);

  const sources = new Map<string, { users: Metric; sessions: Metric }>();
  const pages = new Map<string, { sessions: number; bounceWeighted: number; bounceWeight: number }>();
  for (const b of breakdowns) {
    if (b.kind === "SOURCE") {
      const cur = sources.get(b.key) ?? { users: null, sessions: null };
      sources.set(b.key, {
        users: sumNullable([cur.users, b.users]),
        sessions: sumNullable([cur.sessions, b.sessions]),
      });
    } else if (b.kind === "LANDING_PAGE") {
      const cur = pages.get(b.key) ?? { sessions: 0, bounceWeighted: 0, bounceWeight: 0 };
      cur.sessions += b.sessions ?? 0;
      if (b.bounceRate !== null && b.sessions) {
        cur.bounceWeighted += b.bounceRate * b.sessions;
        cur.bounceWeight += b.sessions;
      }
      pages.set(b.key, cur);
    }
  }

  return {
    ...agg,
    connected: channels > 0,
    trafficSources: [...sources.entries()]
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0)),
    topLandingPages: [...pages.entries()]
      .map(([page, v]) => ({
        page,
        sessions: v.sessions,
        bounceRate: v.bounceWeight > 0 ? round(v.bounceWeighted / v.bounceWeight) : null,
      }))
      .sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0))
      .slice(0, 20),
  };
}

export type PostRow = {
  id: string;
  title: string | null;
  content: string | null;
  thumbnailUrl: string | null;
  platform: Platform;
  channelName: string;
  publishedAt: Date;
  postType: string | null;
  permalink: string | null;
  likes: Metric;
  comments: Metric;
  shares: Metric;
  impressions: Metric;
  reach: Metric;
  clicks: Metric;
  saves: Metric;
  views: Metric;
  engagementRate: Metric;
  ctr: Metric;
  engagement: Metric;
};

export async function getPostsForRange(range: DateRange, platform?: Platform): Promise<PostRow[]> {
  const posts = await prisma.post.findMany({
    where: {
      publishedAt: { gte: range.start, lte: range.end },
      ...(platform ? { platform } : {}),
    },
    include: {
      channel: { select: { name: true } },
      metrics: { orderBy: { date: "desc" }, take: 1 },
    },
    orderBy: { publishedAt: "desc" },
  });

  return posts.map((p) => {
    const m = p.metrics[0];
    const base = {
      likes: m?.likes ?? null,
      comments: m?.comments ?? null,
      shares: m?.shares ?? null,
      saves: m?.saves ?? null,
    };
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
      ...base,
      impressions: m?.impressions ?? null,
      reach: m?.reach ?? null,
      clicks: m?.clicks ?? null,
      views: m?.views ?? null,
      engagementRate: m?.engagementRate ?? null,
      ctr: m?.ctr ?? null,
      engagement: postEngagement(base),
    };
  });
}

/** Sort descending by a nullable value; rows with no value go last and never "win". */
export function rankBy<T>(
  rows: T[],
  getValue: (row: T) => number | null,
  direction: "desc" | "asc" = "desc"
): T[] {
  const withValue = rows.filter((r) => getValue(r) !== null);
  const without = rows.filter((r) => getValue(r) === null);
  withValue.sort((a, b) =>
    direction === "desc"
      ? (getValue(b) as number) - (getValue(a) as number)
      : (getValue(a) as number) - (getValue(b) as number)
  );
  return [...withValue, ...without];
}

/** The leader for a metric, or undefined when nobody has a value. */
export function leaderBy<T>(rows: T[], getValue: (row: T) => number | null): T | undefined {
  const top = rankBy(rows, getValue)[0];
  return top && getValue(top) !== null ? top : undefined;
}

export { addDaysUtc };
