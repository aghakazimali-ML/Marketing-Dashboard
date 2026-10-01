"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard, InsightPill } from "@/components/ui/section-card";
import { MetricCard } from "@/components/ui/metric-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  ErrorState,
  LoadingState,
  useRangeFetch,
} from "@/components/hooks/use-range-fetch";
import { useDateRange } from "@/components/providers/date-range-provider";
import { formatNumber, type DatePreset } from "@/lib/metrics/periods";
import { format } from "date-fns";
import type { ComparedRow } from "@/lib/metrics/queries";
import { DASHBOARD_NAME } from "@/lib/brand";

type Report = {
  meta: { title: string; period: string; generatedAt: string };
  executiveSummary: string;
  kpi: {
    followers: number;
    impressions: number;
    engagement: number;
    clicks: number;
    newFollowers: number;
    websiteUsers: number;
    websiteSessions: number;
    conversions: number;
  };
  allPagesComparison: ComparedRow[];
  topPosts: {
    id: string;
    title: string | null;
    platform: string;
    channelName: string;
    engagement: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
    clicks: number;
  }[];
  website: {
    users: number;
    sessions: number;
    bounceRate: number;
    trafficSources: { source: string; users: number; sessions: number }[];
  };
};

const REPORT_TYPES: { id: DatePreset; label: string }[] = [
  { id: "last_month", label: "Monthly Report" },
  { id: "last_2_months", label: "Two-Month Report" },
  { id: "last_quarter", label: "Quarterly Report" },
  { id: "custom", label: "Custom Date Report" },
];

export default function ReportsPage() {
  return (
    <AppShell
      title="Reports"
      subtitle="Generate KPI summaries, LinkedIn comparisons, and exports"
    >
      <ReportsContent />
    </AppShell>
  );
}

function ReportsContent() {
  const { range, setPreset } = useDateRange();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error } = useRangeFetch<Report>("/api/reports");

  const exportUrl = useMemo(() => {
    const q = new URLSearchParams({
      preset: range.preset,
      from: format(range.start, "yyyy-MM-dd"),
      to: format(range.end, "yyyy-MM-dd"),
    });
    return `/api/reports?${q.toString()}`;
  }, [range]);

  async function downloadCsv() {
    setBusy("csv");
    try {
      const res = await fetch(`${exportUrl}&format=csv`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `marketing-report-${format(range.start, "yyyyMMdd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  async function downloadExcel() {
    setBusy("xlsx");
    try {
      const res = await fetch(exportUrl);
      const report = (await res.json()) as Report;
      const XLSX = await import("xlsx");
      const kpiSheet = [
        ["Metric", "Value"],
        ["Followers", report.kpi.followers],
        ["Impressions", report.kpi.impressions],
        ["Engagement", report.kpi.engagement],
        ["Clicks", report.kpi.clicks],
        ["New Followers", report.kpi.newFollowers],
        ["Website Users", report.kpi.websiteUsers],
        ["Sessions", report.kpi.websiteSessions],
        ["Conversions", report.kpi.conversions],
      ];
      const allPagesSheet = [
        ["Platform", "Page", "Followers", "New", "Impressions", "Engagement", "ER%", "Clicks", "Growth%"],
        ...report.allPagesComparison.map((r) => [
          r.platform,
          r.name,
          r.followers,
          r.newFollowers,
          r.impressions,
          r.engagement,
          r.engagementRate,
          r.clicks,
          r.growthPct,
        ]),
      ];
      const postsSheet = [
        ["Title", "Platform", "Channel", "Engagement", "Likes", "Comments", "Shares", "ER%", "Clicks"],
        ...report.topPosts.map((p) => [
          p.title,
          p.platform,
          p.channelName,
          p.engagement,
          p.likes,
          p.comments,
          p.shares,
          p.engagementRate,
          p.clicks,
        ]),
      ];
      const trafficSheet = [
        ["Source", "Users", "Sessions"],
        ...report.website.trafficSources.map((t) => [
          t.source,
          t.users,
          t.sessions,
        ]),
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiSheet), "KPI");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(allPagesSheet), "All Pages");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(postsSheet), "Top Posts");
      if (trafficSheet.length > 1) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trafficSheet), "Traffic Sources");
      }
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([["Executive Summary"], [report.executiveSummary]]),
        "Summary"
      );
      XLSX.writeFile(wb, `marketing-report-${format(range.start, "yyyyMMdd")}.xlsx`);
    } finally {
      setBusy(null);
    }
  }

  async function downloadPdf() {
    setBusy("pdf");
    try {
      const res = await fetch(exportUrl);
      const report = (await res.json()) as Report;
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`${DASHBOARD_NAME} Report`, 14, 18);
      doc.setFontSize(10);
      doc.text(`Period: ${report.meta.period}`, 14, 26);
      doc.text(`Generated: ${format(new Date(report.meta.generatedAt), "PPpp")}`, 14, 32);
      const summaryLines = doc.splitTextToSize(report.executiveSummary, 180);
      doc.text(summaryLines, 14, 42);
      autoTable(doc, {
        startY: 42 + summaryLines.length * 5 + 6,
        head: [["Metric", "Value"]],
        body: [
          ["Followers", formatNumber(report.kpi.followers)],
          ["Impressions", formatNumber(report.kpi.impressions)],
          ["Engagement", formatNumber(report.kpi.engagement)],
          ["Clicks", formatNumber(report.kpi.clicks)],
          ["Website Users", formatNumber(report.kpi.websiteUsers)],
          ["Conversions", formatNumber(report.kpi.conversions)],
        ],
      });
      const y = doc.lastAutoTable?.finalY ?? 100;
      autoTable(doc, {
        startY: y + 8,
        head: [["Platform", "Page", "Followers", "ER%", "Growth%"]],
        body: report.allPagesComparison.map((r) => [
          r.platform,
          r.name,
          formatNumber(r.followers),
          r.engagementRate.toFixed(1),
          r.growthPct.toFixed(1),
        ]),
      });
      doc.save(`marketing-report-${format(range.start, "yyyyMMdd")}.pdf`);
    } finally {
      setBusy(null);
    }
  }

  const allPagesCols: Column<ComparedRow>[] = [
    {
      key: "platform",
      header: "Platform",
      render: (r) => <span className="text-xs uppercase text-muted">{r.platform}</span>,
    },
    {
      key: "name",
      header: "Page",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "followers",
      header: "Followers",
      align: "right",
      render: (r) => formatNumber(r.followers),
    },
    {
      key: "er",
      header: "ER",
      align: "right",
      render: (r) => `${r.engagementRate.toFixed(1)}%`,
    },
    {
      key: "growth",
      header: "Growth",
      align: "right",
      render: (r) => `${r.growthPct.toFixed(1)}%`,
    },
  ];

  return (
    <div className="space-y-6">
      <SectionCard title="Report type" subtitle="Sets the global date range used across the dashboard">
        <div className="flex flex-wrap gap-2">
          {REPORT_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPreset(t.id)}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                range.preset === t.id
                  ? "bg-navy-900 text-white"
                  : "border border-line bg-card text-navy-900 hover:bg-sand-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadPdf}
            disabled={!!busy}
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
          >
            {busy === "pdf" ? "Exporting…" : "Export PDF"}
          </button>
          <button
            type="button"
            onClick={downloadExcel}
            disabled={!!busy}
            className="rounded-md border border-line bg-card px-4 py-2 text-sm font-medium hover:bg-sand-100 disabled:opacity-50"
          >
            {busy === "xlsx" ? "Exporting…" : "Export Excel"}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={!!busy}
            className="rounded-md border border-line bg-card px-4 py-2 text-sm font-medium hover:bg-sand-100 disabled:opacity-50"
          >
            {busy === "csv" ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </SectionCard>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {data && (
        <>
          <SectionCard title="Executive summary">
            <p className="text-sm leading-relaxed text-ink">{data.executiveSummary}</p>
          </SectionCard>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Followers" value={data.kpi.followers} compact />
            <MetricCard label="Impressions" value={data.kpi.impressions} compact />
            <MetricCard label="Engagement" value={data.kpi.engagement} compact />
            <MetricCard label="Website Users" value={data.kpi.websiteUsers} compact />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <InsightPill
              label="Conversions"
              value={formatNumber(data.kpi.conversions)}
            />
            <InsightPill
              label="Sessions"
              value={formatNumber(data.kpi.websiteSessions)}
            />
            <InsightPill
              label="Bounce rate"
              value={`${data.website.bounceRate.toFixed(1)}%`}
            />
          </div>

          <SectionCard title="All Pages Comparison">
            <DataTable
              columns={allPagesCols}
              rows={data.allPagesComparison}
              rowKey={(r) => r.channelId}
            />
          </SectionCard>

          <SectionCard title="Top posts">
            <ul className="space-y-2">
              {data.topPosts.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-start justify-between gap-3 border-b border-line/70 py-2 text-sm last:border-0"
                >
                  <span>
                    <span className="mr-2 text-muted">{i + 1}.</span>
                    {p.title}
                    <span className="ml-2 text-xs text-muted">
                      {p.platform} · {p.channelName}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {formatNumber(p.engagement)} eng
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  );
}
