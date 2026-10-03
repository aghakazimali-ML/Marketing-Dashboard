import { Platform } from "@/generated/prisma/client";
import {
  getChannelMetricsForRange,
  getPostsForRange,
  getWebsiteMetrics,
  leaderBy,
  rankBy,
} from "@/lib/metrics/queries";
import { formatNumber, type DateRange } from "@/lib/metrics/periods";
import { totalFor } from "@/lib/metrics/totals";

export const SOCIAL_PLATFORMS: Platform[] = [Platform.LINKEDIN, Platform.FACEBOOK, Platform.INSTAGRAM, Platform.YOUTUBE];

/** Assemble everything a report (JSON, CSV, Excel, PDF, email digest) needs. */
export async function buildReport(range: DateRange, opts: { includePosts: boolean }) {
  const [rows, website, posts] = await Promise.all([
    getChannelMetricsForRange(SOCIAL_PLATFORMS, range),
    getWebsiteMetrics(range),
    opts.includePosts ? getPostsForRange(range) : Promise.resolve([]),
  ]);

  const linkedin = rows.filter((r) => r.platform === Platform.LINKEDIN);
  const topPosts = rankBy(posts, (p) => p.engagement).slice(0, 10);
  const totals = {
    followers: totalFor(rows, "followers"),
    impressions: totalFor(rows, "impressions"),
    engagement: totalFor(rows, "engagement"),
    clicks: totalFor(rows, "clicks"),
    newFollowers: totalFor(rows, "newFollowers"),
  };
  const bestLi = leaderBy(linkedin, (r) => r.engagementRate);
  const top = topPosts[0]?.engagement != null ? topPosts[0] : undefined;
  const num = (v: number | null, compact = false) => (v === null ? "not available" : formatNumber(v, compact));

  const executiveSummary = [
    `Period: ${range.label} (${range.start.toDateString()} – ${range.end.toDateString()}).`,
    totals.impressions.value !== null
      ? `Across ${totals.impressions.platforms.join(", ")}, your channels reached ${num(totals.impressions.value, true)} impressions with ${num(totals.engagement.value, true)} engagements. Platforms that do not report a metric are excluded from that total.`
      : "No impressions were reported for this period.",
    totals.newFollowers.value !== null ? `Net follower change: ${num(totals.newFollowers.value)}.` : "",
    bestLi ? `Top LinkedIn page: ${bestLi.name} at ${bestLi.engagementRate}% engagement rate.` : "",
    website.connected
      ? `Website: ${num(website.users)} users and ${num(website.sessions)} sessions; ${num(website.conversions)} key events.`
      : "",
    top ? `Top post: “${top.title}” on ${top.platform} (${formatNumber(top.engagement ?? 0)} engagements).` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const kpi = {
    followers: totals.followers.value,
    impressions: totals.impressions.value,
    engagement: totals.engagement.value,
    clicks: totals.clicks.value,
    newFollowers: totals.newFollowers.value,
    websiteUsers: website.users,
    websiteSessions: website.sessions,
    conversions: website.conversions,
  };

  return {
    rows,
    website,
    topPosts,
    totals,
    executiveSummary,
    kpi,
    kpiPlatforms: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.platforms])),
  };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;
