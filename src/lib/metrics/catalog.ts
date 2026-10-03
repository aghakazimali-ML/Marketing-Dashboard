import type { Platform } from "@/generated/prisma/client";

/** One constant per connector, so an API upgrade is a one-line change. */
export const API_VERSIONS = {
  LINKEDIN: "202607", // LinkedIn-Version header (YYYYMM)
  META: "v25.0", // Graph API
  YOUTUBE_DATA: "v3",
  YOUTUBE_ANALYTICS: "v2",
  GA4: "v1beta",
} as const;

export type MetricKey =
  | "followers" | "newFollowers" | "impressions" | "reach" | "engagement"
  | "engagementRate" | "likes" | "comments" | "shares" | "clicks" | "ctr" | "saves"
  | "profileVisits" | "videoViews" | "watchTimeMin" | "avgViewDurSec"
  | "returningViewers" | "postCount" | "growthPct";

type Provides = Partial<Record<MetricKey, string>>;

/** Which metrics each platform's API supplies, with the source shown as a UI note. */
export const PLATFORM_METRICS: Record<Exclude<Platform, "WEBSITE">, { api: string; provides: Provides }> = {
  LINKEDIN: {
    api: `LinkedIn Community Management API (${API_VERSIONS.LINKEDIN})`,
    provides: {
      followers: "organizationalEntityFollowerStatistics (total followers)",
      newFollowers: "Daily follower gains",
      impressions: "organizationalEntityShareStatistics: impressionCount",
      reach: "organizationalEntityShareStatistics: uniqueImpressionsCount",
      engagement: "organizationalEntityShareStatistics: likes + comments + shares + clicks",
      likes: "organizationalEntityShareStatistics: likeCount",
      comments: "organizationalEntityShareStatistics: commentCount",
      shares: "organizationalEntityShareStatistics: shareCount",
      clicks: "organizationalEntityShareStatistics: clickCount",
      postCount: "Posts stored for this page",
    },
  },
  FACEBOOK: {
    api: `Meta Graph API ${API_VERSIONS.META} (Page Insights)`,
    provides: {
      followers: "Page followers_count",
      newFollowers: "page_daily_follows_unique",
      impressions: "page_media_view (Views)",
      reach: "page_total_media_view_unique (unique viewers)",
      engagement: "page_post_engagements",
      postCount: "Posts stored for this page",
    },
  },
  INSTAGRAM: {
    api: `Instagram Graph API ${API_VERSIONS.META} (Account Insights)`,
    provides: {
      followers: "followers_count",
      newFollowers: "follows_and_unfollows (net)",
      impressions: "views",
      reach: "reach",
      engagement: "likes + comments + shares + saves",
      likes: "likes",
      comments: "comments",
      shares: "shares",
      saves: "saves",
      profileVisits: "profile_views",
      clicks: "profile_links_taps",
      postCount: "Posts stored for this account",
    },
  },
  YOUTUBE: {
    api: "YouTube Analytics API v2 + Data API v3",
    provides: {
      followers: "Data API: subscriberCount",
      newFollowers: "Analytics: subscribersGained − subscribersLost",
      videoViews: "Analytics: views",
      watchTimeMin: "Analytics: estimatedMinutesWatched",
      avgViewDurSec: "Analytics: averageViewDuration (weighted by views)",
      returningViewers: "Analytics: returning viewers",
      likes: "Analytics: likes",
      comments: "Analytics: comments",
      shares: "Analytics: shares",
      engagement: "likes + comments + shares",
      postCount: "Videos stored for this channel",
    },
  },
};

export const FORMULAS: Partial<Record<MetricKey, string>> = {
  engagementRate: "Engagement ÷ impressions (Instagram: engagement ÷ reach).",
  ctr: "Clicks ÷ impressions.",
  newFollowers: "Followers at end of range minus followers before the range (falls back to reported daily gains).",
  growthPct: "New followers ÷ followers before the range.",
  followers: "Latest value in the selected range.",
  avgViewDurSec: "Average view duration weighted by views.",
};

export type NullReason = "not_connected" | "no_data" | "not_provided";

export function nullReasonText(reason: NullReason, platformLabel?: string): string {
  switch (reason) {
    case "not_connected":
      return "Not connected";
    case "not_provided":
      return `Not provided by ${platformLabel ?? "this platform"}`;
    default:
      return "No data in this period";
  }
}

export function isMetricProvided(platform: Platform, key: MetricKey): boolean {
  if (platform === "WEBSITE") return true;
  const provides = PLATFORM_METRICS[platform].provides;
  if (key === "engagementRate") return Boolean(provides.engagement);
  if (key === "ctr") return Boolean(provides.clicks && provides.impressions);
  if (key === "growthPct") return Boolean(provides.followers);
  return key in provides;
}
