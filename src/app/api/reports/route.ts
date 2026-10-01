import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/authorization";
import { Platform } from "@/generated/prisma/client";
import { parseRangeParams } from "@/lib/metrics/params";
import {
  getChannelMetricsForRange,
  getPostsForRange,
  getWebsiteMetrics,
  rankBy,
} from "@/lib/metrics/queries";
import { formatNumber } from "@/lib/metrics/periods";
import { DASHBOARD_NAME } from "@/lib/brand";

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const range = parseRangeParams(sp);
  const format = sp.format || "json";

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

  const rows = social;
  const linkedin = rows.filter((r) => r.platform === Platform.LINKEDIN);
  const topPosts = rankBy(posts, (p) => p.engagement).slice(0, 10);

  const totals = {
    followers: rows.reduce((s, r) => s + r.followers, 0),
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    engagement: rows.reduce((s, r) => s + r.engagement, 0),
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    newFollowers: rows.reduce((s, r) => s + r.newFollowers, 0),
  };
  const bestLi = rankBy(linkedin, (r) => r.engagementRate)[0];
  const executiveSummary = [
    `Period: ${range.label} (${range.start.toDateString()} – ${range.end.toDateString()}).`,
    `Across channels, your organization reached ${formatNumber(totals.impressions, true)} impressions with ${formatNumber(totals.engagement, true)} engagements and ${formatNumber(totals.newFollowers)} new followers.`,
    bestLi
      ? `Top LinkedIn page: ${bestLi.name} at ${bestLi.engagementRate}% engagement rate.`
      : "",
    `Website: ${formatNumber(website.users)} users and ${formatNumber(website.sessions)} sessions; ${formatNumber(website.conversions)} conversions.`,
    topPosts[0]
      ? `Top post: “${topPosts[0].title}” on ${topPosts[0].platform} (${formatNumber(topPosts[0].engagement)} engagements).`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const report = {
    meta: {
      title: `${DASHBOARD_NAME} Report`,
      period: range.label,
      generatedAt: new Date().toISOString(),
    },
    executiveSummary,
    kpi: {
      ...totals,
      websiteUsers: website.users,
      websiteSessions: website.sessions,
      conversions: website.conversions,
    },
    platforms: rows,
    allPagesComparison: rows,
    topPosts,
    website,
  };

  if (format === "csv") {
    const lines: string[] = [];
    lines.push("Section,Metric,Value");
    lines.push(`KPI,Followers,${totals.followers}`);
    lines.push(`KPI,Impressions,${totals.impressions}`);
    lines.push(`KPI,Engagement,${totals.engagement}`);
    lines.push(`KPI,Clicks,${totals.clicks}`);
    lines.push(`KPI,New Followers,${totals.newFollowers}`);
    lines.push(`KPI,Website Users,${website.users}`);
    lines.push(`KPI,Website Sessions,${website.sessions}`);
    lines.push("");
    lines.push("Platform,Page,Followers,New Followers,Impressions,Engagement,Engagement Rate,Clicks,Growth %");
    for (const r of rows) {
      lines.push(
        [
          r.platform,
          `"${r.name}"`,
          r.followers,
          r.newFollowers,
          r.impressions,
          r.engagement,
          r.engagementRate,
          r.clicks,
          r.growthPct,
        ].join(",")
      );
    }
    lines.push("");
    lines.push("Top Posts,Title,Platform,Channel,Engagement,Likes,Comments,Shares,ER,Clicks");
    for (const p of topPosts) {
      lines.push(
        [
          "Post",
          `"${(p.title ?? "").replace(/"/g, '""')}"`,
          p.platform,
          `"${p.channelName}"`,
          p.engagement,
          p.likes,
          p.comments,
          p.shares,
          p.engagementRate,
          p.clicks,
        ].join(",")
      );
    }
    
    if (website.trafficSources.length > 0) {
      lines.push("");
      lines.push("Traffic Sources,Source,Users,Sessions");
      for (const t of website.trafficSources) {
        lines.push(["Traffic", `"${t.source}"`, t.users, t.sessions].join(","));
      }
    }
    lines.push("");
    lines.push(`Executive Summary,"${executiveSummary.replace(/"/g, '""')}"`);

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="marketing-report.csv"`,
      },
    });
  }

  return NextResponse.json(report);
}
