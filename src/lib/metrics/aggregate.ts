import type { Platform } from "@/generated/prisma/client";

/** A metric the platform did not provide is `null`, never 0. */
export type Metric = number | null;

export function sumNullable(values: Iterable<Metric | undefined>): Metric {
  let total = 0;
  let seen = false;
  for (const v of values) {
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    total += v;
    seen = true;
  }
  return seen ? total : null;
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** a / b as a percentage, or null when either side is missing or b is 0. */
export function ratioPct(a: Metric, b: Metric): Metric {
  if (a === null || b === null || b <= 0) return null;
  return round((a / b) * 100);
}

export type DailyChannelRow = {
  date: Date;
  followers: Metric;
  newFollowers: Metric;
  impressions: Metric;
  reach: Metric;
  engagement: Metric;
  likes: Metric;
  comments: Metric;
  shares: Metric;
  clicks: Metric;
  saves: Metric;
  profileVisits: Metric;
  videoViews: Metric;
  watchTimeMin: Metric;
  avgViewDurSec: Metric;
  returningViewers: Metric;
  postCount: Metric;
};

export type ChannelAggregate = Omit<DailyChannelRow, "date"> & {
  engagementRate: Metric;
  ctr: Metric;
  growthPct: Metric;
};

const ADDITIVE = [
  "impressions", "reach", "engagement", "likes", "comments", "shares", "clicks",
  "saves", "profileVisits", "videoViews", "watchTimeMin", "returningViewers", "postCount",
] as const;

/**
 * Engagement rate definition per platform (shown in UI tooltips):
 * - Instagram: (likes + comments + shares + saves) / reach
 * - everything else: engagement / impressions
 */
export function engagementRateFor(
  platform: Platform,
  a: { engagement: Metric; impressions: Metric; reach: Metric }
): Metric {
  return platform === "INSTAGRAM"
    ? ratioPct(a.engagement, a.reach)
    : ratioPct(a.engagement, a.impressions);
}

export function aggregateChannelDays(
  platform: Platform,
  days: DailyChannelRow[],
  followersBeforeRange: Metric
): ChannelAggregate {
  const sorted = [...days].sort((a, b) => a.date.getTime() - b.date.getTime());

  const out = {} as Record<string, Metric>;
  for (const key of ADDITIVE) out[key] = sumNullable(sorted.map((d) => d[key]));

  const withFollowers = sorted.filter((d) => d.followers !== null);
  const followers = withFollowers.length
    ? withFollowers[withFollowers.length - 1].followers
    : null;

  // New followers: end-of-range count minus the count before the range; fall back to the
  // API-reported daily gains when no earlier follower count has been recorded yet.
  let newFollowers: Metric;
  if (followers !== null && followersBeforeRange !== null) {
    newFollowers = followers - followersBeforeRange;
  } else {
    newFollowers = sumNullable(sorted.map((d) => d.newFollowers));
  }

  // Average view duration is weighted by video views.
  let weighted = 0;
  let weight = 0;
  for (const d of sorted) {
    if (d.avgViewDurSec === null || d.videoViews === null || d.videoViews <= 0) continue;
    weighted += d.avgViewDurSec * d.videoViews;
    weight += d.videoViews;
  }
  const avgViewDurSec = weight > 0 ? round(weighted / weight, 1) : null;

  const base = followers !== null && newFollowers !== null ? followers - newFollowers : null;
  const growthPct = newFollowers !== null && base !== null && base > 0
    ? round((newFollowers / base) * 100)
    : null;

  const agg = out as Record<(typeof ADDITIVE)[number], Metric>;
  return {
    followers,
    newFollowers,
    ...agg,
    avgViewDurSec,
    engagementRate: engagementRateFor(platform, agg),
    ctr: ratioPct(agg.clicks, agg.impressions),
    growthPct,
  };
}

export type DailyWebsiteRow = {
  date: Date;
  users: Metric;
  sessions: Metric;
  newUsers: Metric;
  bounceRate: Metric;
  avgSessionDurationSec: Metric;
  conversions: Metric;
};

export type WebsiteAggregate = Omit<DailyWebsiteRow, "date">;

/** Sums counts; bounce rate and session duration are session-weighted averages. */
export function aggregateWebsiteDays(days: DailyWebsiteRow[]): WebsiteAggregate {
  function weightedAvg(pick: (d: DailyWebsiteRow) => Metric): Metric {
    let total = 0;
    let weight = 0;
    for (const d of days) {
      const v = pick(d);
      if (v === null || d.sessions === null || d.sessions <= 0) continue;
      total += v * d.sessions;
      weight += d.sessions;
    }
    return weight > 0 ? round(total / weight) : null;
  }
  return {
    users: sumNullable(days.map((d) => d.users)),
    sessions: sumNullable(days.map((d) => d.sessions)),
    newUsers: sumNullable(days.map((d) => d.newUsers)),
    conversions: sumNullable(days.map((d) => d.conversions)),
    bounceRate: weightedAvg((d) => d.bounceRate),
    avgSessionDurationSec: weightedAvg((d) => d.avgSessionDurationSec),
  };
}

/** Post engagement: likes + comments + shares + saves (null when none were reported). */
export function postEngagement(m: {
  likes: Metric; comments: Metric; shares: Metric; saves: Metric;
}): Metric {
  return sumNullable([m.likes, m.comments, m.shares, m.saves]);
}
