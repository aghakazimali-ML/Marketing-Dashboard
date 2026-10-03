import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/authorization";
import { resolveRequestRange } from "@/lib/metrics/request";
import { gateFeature } from "@/lib/billing/workspace";
import { buildReport } from "@/lib/reports/build";
import { DASHBOARD_NAME } from "@/lib/brand";
import { csvCell } from "@/lib/security/sanitize";

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const { range, plan } = await resolveRequestRange(sp);
  const format = sp.format || "json";
  // CSV is on every plan; Excel/PDF exports (purpose=export) need the plan feature.
  if (format !== "csv" && sp.purpose === "export") {
    const gate = await gateFeature("excelPdfExport");
    if (!gate.ok) return gate.response;
  }

  const { rows, website, topPosts, executiveSummary, kpi, kpiPlatforms } = await buildReport(range, {
    includePosts: plan.features.posts,
  });

  if (format === "csv") {
    const lines: string[] = ["Section,Metric,Value"];
    const cell = csvCell;
    const label: Record<string, string> = {
      followers: "Followers", impressions: "Impressions", engagement: "Engagement", clicks: "Clicks",
      newFollowers: "New Followers", websiteUsers: "Website Users", websiteSessions: "Website Sessions", conversions: "Key Events",
    };
    for (const [k, v] of Object.entries(kpi)) lines.push(`KPI,${label[k]},${cell(v)}`);
    lines.push("", "Platform,Page,Followers,New Followers,Impressions,Engagement,Engagement Rate,Clicks,Growth %");
    for (const r of rows) {
      lines.push([r.platform, cell(r.name), cell(r.followers), cell(r.newFollowers), cell(r.impressions), cell(r.engagement), cell(r.engagementRate), cell(r.clicks), cell(r.growthPct)].join(","));
    }
    lines.push("", "Top Posts,Title,Platform,Channel,Engagement,Likes,Comments,Shares,ER,Clicks");
    for (const p of topPosts) {
      lines.push(["Post", cell(p.title), p.platform, cell(p.channelName), cell(p.engagement), cell(p.likes), cell(p.comments), cell(p.shares), cell(p.engagementRate), cell(p.clicks)].join(","));
    }
    if (website.trafficSources.length > 0) {
      lines.push("", "Traffic Sources,Source,Users,Sessions");
      for (const t of website.trafficSources) lines.push(["Traffic", cell(t.source), cell(t.users), cell(t.sessions)].join(","));
    }
    lines.push("", `Executive Summary,${cell(executiveSummary)}`);

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="marketing-report.csv"`,
      },
    });
  }

  return NextResponse.json({
    meta: { title: `${DASHBOARD_NAME} Report`, period: range.label, generatedAt: new Date().toISOString() },
    executiveSummary,
    kpi,
    kpiPlatforms,
    platforms: rows,
    allPagesComparison: rows,
    topPosts,
    website,
  });
}
