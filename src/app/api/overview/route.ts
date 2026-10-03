import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/authorization";
import { Platform } from "@/generated/prisma/client";
import { resolveRequestRange } from "@/lib/metrics/request";
import { previousRange } from "@/lib/metrics/periods";
import {
  getChannelMetricsForRange,
  getPostsForRange,
  getSeries,
  getWebsiteMetrics,
  leaderBy,
  type SeriesGrain,
} from "@/lib/metrics/queries";
import { prisma } from "@/lib/db";
import { ratioPct } from "@/lib/metrics/aggregate";
import { deltaPct, totalFor } from "@/lib/metrics/totals";
import { lastSuccessfulSync } from "@/lib/sync";

const SOCIAL: Platform[] = [Platform.LINKEDIN, Platform.FACEBOOK, Platform.INSTAGRAM, Platform.YOUTUBE];

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const { range, plan, clamped } = await resolveRequestRange(sp);
  const prev = previousRange(range);
  const compare = plan.features.periodComparison;
  const grain: SeriesGrain = sp.grain === "week" || sp.grain === "month" ? sp.grain : "day";
  const seriesPlatforms =
    sp.platform && SOCIAL.includes(sp.platform.toUpperCase() as Platform)
      ? [sp.platform.toUpperCase() as Platform]
      : SOCIAL;

  const [social, prevSocial, website, prevWebsite, posts, series, channelCount, last] = await Promise.all([
    getChannelMetricsForRange(SOCIAL, range),
    compare ? getChannelMetricsForRange(SOCIAL, prev) : Promise.resolve([]),
    getWebsiteMetrics(range),
    compare ? getWebsiteMetrics(prev) : Promise.resolve(null),
    plan.features.posts ? getPostsForRange(range) : Promise.resolve([]),
    getSeries(seriesPlatforms, range, grain),
    prisma.channel.count({ where: { isActive: true } }),
    lastSuccessfulSync(),
  ]);

  const byPlatform = SOCIAL.map((p) => {
    const rows = social.filter((r) => r.platform === p);
    const impressions = totalFor(rows, "impressions").value;
    const engagement = totalFor(rows, "engagement").value;
    const reach = totalFor(rows, "reach").value;
    return {
      platform: p,
      connected: rows.length > 0,
      followers: totalFor(rows, "followers").value,
      newFollowers: totalFor(rows, "newFollowers").value,
      impressions,
      engagement,
      clicks: totalFor(rows, "clicks").value,
      reach,
      engagementRate: p === "INSTAGRAM" ? ratioPct(engagement, reach) : ratioPct(engagement, impressions),
    };
  });

  const keys = ["followers", "impressions", "reach", "engagement", "clicks", "newFollowers"] as const;
  const totals = Object.fromEntries(
    keys.map((k) => {
      const cur = totalFor(social, k);
      const before = totalFor(prevSocial, k);
      return [k, { ...cur, delta: compare ? deltaPct(cur.value, before.value) : undefined }];
    })
  );
  const impTotal = totalFor(social, "impressions");
  const engTotal = totalFor(social, "engagement");
  // Engagement rate only compares platforms that report both numbers.
  const both = social.filter((r) => r.impressions !== null && r.engagement !== null && r.platform !== "INSTAGRAM");
  const rate = ratioPct(totalFor(both, "engagement").value, totalFor(both, "impressions").value);
  const prevBoth = prevSocial.filter((r) => r.impressions !== null && r.engagement !== null && r.platform !== "INSTAGRAM");
  const prevRate = ratioPct(totalFor(prevBoth, "engagement").value, totalFor(prevBoth, "impressions").value);

  const linkedin = social.filter((r) => r.platform === Platform.LINKEDIN);
  const bestPlatform = leaderBy(byPlatform, (p) => p.engagementRate);
  const topPost = posts
    .filter((p) => p.engagement !== null)
    .sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0))[0];

  return NextResponse.json({
    range: { label: range.label, start: range.start.toISOString(), end: range.end.toISOString() },
    hasChannels: channelCount > 0,
    clamped,
    historyDays: plan.limits.historyDays,
    comparisonLocked: !compare,
    postsLocked: !plan.features.posts,
    lastSuccessAt: last?.finishedAt ?? null,
    totals: {
      ...totals,
      engagementRate: { value: rate, platforms: [...new Set(both.map((r) => r.platform))], delta: compare ? deltaPct(rate, prevRate) : undefined },
      websiteUsers: { value: website.users, platforms: website.connected ? ["WEBSITE"] : [], delta: compare && prevWebsite ? deltaPct(website.users, prevWebsite.users) : undefined },
      websiteSessions: { value: website.sessions, platforms: website.connected ? ["WEBSITE"] : [], delta: compare && prevWebsite ? deltaPct(website.sessions, prevWebsite.sessions) : undefined },
    },
    impressionsPlatforms: impTotal.platforms,
    engagementPlatforms: engTotal.platforms,
    websiteConnected: website.connected,
    byPlatform,
    bestPlatform: bestPlatform ? { platform: bestPlatform.platform, engagementRate: bestPlatform.engagementRate } : null,
    bestLinkedIn: (() => {
      const l = leaderBy(linkedin, (r) => r.engagementRate);
      return l ? { name: l.name, engagementRate: l.engagementRate, impressions: l.impressions } : null;
    })(),
    topPost: topPost
      ? { title: topPost.title, platform: topPost.platform, channelName: topPost.channelName, engagement: topPost.engagement, publishedAt: topPost.publishedAt }
      : null,
    series,
    grain,
  });
}
