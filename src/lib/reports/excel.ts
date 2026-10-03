import ExcelJS from "exceljs";
import { safeSpreadsheetText } from "@/lib/security/sanitize";

type Cell = string | number | null | undefined;

export type ExcelReportInput = {
  kpi: Record<string, Cell>;
  allPagesComparison: {
    platform: string;
    name: string;
    followers: Cell;
    newFollowers: Cell;
    impressions: Cell;
    engagement: Cell;
    engagementRate: Cell;
    clicks: Cell;
    growthPct: Cell;
  }[];
  topPosts: {
    title: string | null;
    platform: string;
    channelName: string;
    engagement: Cell;
    likes: Cell;
    comments: Cell;
    shares: Cell;
    engagementRate: Cell;
    clicks: Cell;
  }[];
  website: { trafficSources: { source: string; users: number; sessions: number }[] };
  executiveSummary: string;
};

function sheet(wb: ExcelJS.Workbook, name: string, rows: Cell[][]) {
  const ws = wb.addWorksheet(name);
  for (const row of rows) {
    // Text is neutralised so spreadsheet apps never evaluate it as a formula.
    ws.addRow(
      row.map((c) => (typeof c === "string" ? safeSpreadsheetText(c) : (c ?? null)))
    );
  }
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((col) => (col.width = 18));
  return ws;
}

/** Build an .xlsx workbook; null metrics stay as empty cells (never 0). */
export async function buildReportWorkbook(report: ExcelReportInput) {
  const wb = new ExcelJS.Workbook();
  sheet(wb, "KPI", [
    ["Metric", "Value"],
    ...Object.entries(report.kpi).map(([k, v]) => [k, v] as Cell[]),
  ]);
  sheet(wb, "All Pages", [
    ["Platform", "Page", "Followers", "New", "Impressions", "Engagement", "ER%", "Clicks", "Growth%"],
    ...report.allPagesComparison.map((r) => [
      r.platform, r.name, r.followers, r.newFollowers, r.impressions,
      r.engagement, r.engagementRate, r.clicks, r.growthPct,
    ]),
  ]);
  sheet(wb, "Top Posts", [
    ["Title", "Platform", "Channel", "Engagement", "Likes", "Comments", "Shares", "ER%", "Clicks"],
    ...report.topPosts.map((p) => [
      p.title, p.platform, p.channelName, p.engagement, p.likes,
      p.comments, p.shares, p.engagementRate, p.clicks,
    ]),
  ]);
  if (report.website.trafficSources.length) {
    sheet(wb, "Traffic Sources", [
      ["Source", "Users", "Sessions"],
      ...report.website.trafficSources.map((t) => [t.source, t.users, t.sessions]),
    ]);
  }
  sheet(wb, "Summary", [["Executive Summary"], [report.executiveSummary]]);
  return wb.xlsx.writeBuffer();
}
