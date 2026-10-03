"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard, InsightPill } from "@/components/ui/section-card";
import { MetricCard } from "@/components/ui/metric-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { PlatformBadge } from "@/components/ui/platform-badge";
import { ErrorState, LoadingState, useRangeFetch } from "@/components/hooks/use-range-fetch";
import { useDateRange } from "@/components/providers/date-range-provider";
import { useEntitlements } from "@/components/providers/entitlements-provider";
import { useToast } from "@/components/providers/toast-provider";
import { apiRequest } from "@/lib/client/api";
import { formatMetric } from "@/lib/metrics/format";
import type { DatePreset } from "@/lib/metrics/periods";
import type { ComparedRow, PostRow, WebsiteMetrics } from "@/lib/metrics/queries";
import type { ExcelReportInput } from "@/lib/reports/excel";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useBrand } from "@/components/providers/entitlements-provider";

type Report = {
  meta: { title: string; period: string; generatedAt: string };
  executiveSummary: string;
  kpi: Record<"followers" | "impressions" | "engagement" | "clicks" | "newFollowers" | "websiteUsers" | "websiteSessions" | "conversions", number | null>;
  kpiPlatforms: Record<string, string[]>;
  allPagesComparison: ComparedRow[];
  topPosts: (Omit<PostRow, "publishedAt"> & { publishedAt: string })[];
  website: WebsiteMetrics;
};

const REPORT_TYPES: { id: DatePreset; label: string }[] = [
  { id: "last_month", label: "Monthly Report" },
  { id: "last_2_months", label: "Two-Month Report" },
  { id: "last_quarter", label: "Quarterly Report" },
  { id: "custom", label: "Custom Date Report" },
];

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  return (
    <AppShell title="Reports" subtitle="Generate KPI summaries, comparisons, and exports">
      <ReportsContent />
    </AppShell>
  );
}

function ReportsContent() {
  const { range, setPreset } = useDateRange();
  const { has } = useEntitlements();
  const toast = useToast();
  const brand = useBrand();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error, retry } = useRangeFetch<Report>("/api/reports");
  const canExport = has("excelPdfExport");
  const canRaw = has("rawDataExport");

  const query = useMemo(
    () =>
      new URLSearchParams({
        preset: range.preset,
        from: format(range.start, "yyyy-MM-dd"),
        to: format(range.end, "yyyy-MM-dd"),
      }).toString(),
    [range]
  );
  const stamp = format(range.start, "yyyyMMdd");

  async function run(kind: string, task: () => Promise<void>) {
    setBusy(kind);
    try {
      await task();
    } catch (e) {
      toast.push({ kind: "error", title: "Export failed", body: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setBusy(null);
    }
  }

  const csv = () =>
    run("csv", async () => {
      const res = await fetch(`/api/reports?${query}&format=csv`);
      if (!res.ok) throw new Error("The report could not be generated.");
      download(await res.blob(), `marketing-report-${stamp}.csv`);
    });

  const raw = () =>
    run("raw", async () => {
      const res = await fetch(`/api/export/daily?${query}`);
      if (!res.ok) throw new Error("The data export is not available on your plan.");
      download(await res.blob(), `daily-metrics-${stamp}.csv`);
    });

  const excel = () =>
    run("xlsx", async () => {
      const report = await apiRequest<Report>(`/api/reports?${query}&purpose=export`);
      const { buildReportWorkbook } = await import("@/lib/reports/excel");
      const buffer = await buildReportWorkbook(report as unknown as ExcelReportInput);
      download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `marketing-report-${stamp}.xlsx`);
    });

  const pdf = () =>
    run("pdf", async () => {
      const report = await apiRequest<Report>(`/api/reports?${query}&purpose=export`);
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`${brand} Report`, 14, 18);
      doc.setFontSize(10);
      doc.text(`Period: ${report.meta.period}`, 14, 26);
      doc.text(`Generated: ${format(new Date(report.meta.generatedAt), "PPpp")}`, 14, 32);
      const summaryLines = doc.splitTextToSize(report.executiveSummary, 180);
      doc.text(summaryLines, 14, 42);
      const k = report.kpi;
      autoTable(doc, {
        startY: 42 + summaryLines.length * 5 + 6,
        head: [["Metric", "Value"]],
        body: [
          ["Followers", formatMetric(k.followers)],
          ["Impressions", formatMetric(k.impressions)],
          ["Engagement", formatMetric(k.engagement)],
          ["Clicks", formatMetric(k.clicks)],
          ["Website Users", formatMetric(k.websiteUsers)],
          ["Key Events", formatMetric(k.conversions)],
        ],
      });
      const y = doc.lastAutoTable?.finalY ?? 100;
      autoTable(doc, {
        startY: y + 8,
        head: [["Platform", "Page", "Followers", "ER%", "Growth%"]],
        body: report.allPagesComparison.map((r) => [r.platform, r.name, formatMetric(r.followers), formatMetric(r.engagementRate), formatMetric(r.growthPct)]),
      });
      doc.save(`marketing-report-${stamp}.pdf`);
    });

  const allPagesCols: Column<ComparedRow>[] = [
    { key: "platform", header: "Platform", render: (r) => <PlatformBadge platform={r.platform} /> },
    { key: "name", header: "Page", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "followers", header: "Followers", align: "right", render: (r) => formatMetric(r.followers) },
    { key: "er", header: "ER", align: "right", render: (r) => formatMetric(r.engagementRate, "percent") },
    { key: "growth", header: "Growth", align: "right", render: (r) => formatMetric(r.growthPct, "percent") },
  ];

  const btn = "rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50";
  const lockedBtn = `${btn} inline-flex items-center gap-1.5 border border-line bg-card text-muted hover:bg-sand-100`;

  return (
    <div className="space-y-6">
      <SectionCard title="Report type" subtitle="Sets the global date range used across the dashboard">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Report type">
          {REPORT_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={range.preset === t.id}
              onClick={() => setPreset(t.id)}
              className={`rounded-md px-4 py-2 text-sm font-medium ${range.preset === t.id ? "bg-navy-900 text-on-accent" : "border border-line bg-card text-navy-900 hover:bg-sand-100"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {canExport ? (
            <>
              <button type="button" onClick={() => void pdf()} disabled={!!busy} className={`${btn} bg-teal-600 text-on-accent hover:bg-teal-500`}>
                {busy === "pdf" ? "Exporting…" : "Export PDF"}
              </button>
              <button type="button" onClick={() => void excel()} disabled={!!busy} className={`${btn} border border-line bg-card hover:bg-sand-100`}>
                {busy === "xlsx" ? "Exporting…" : "Export Excel"}
              </button>
            </>
          ) : (
            <Link href="/billing" className={lockedBtn} title="PDF and Excel exports are included from the Starter plan">
              <Lock size={14} aria-hidden="true" /> PDF & Excel (Starter)
            </Link>
          )}
          <button type="button" onClick={() => void csv()} disabled={!!busy} className={`${btn} border border-line bg-card hover:bg-sand-100`}>
            {busy === "csv" ? "Exporting…" : "Export CSV"}
          </button>
          {canRaw ? (
            <button type="button" onClick={() => void raw()} disabled={!!busy} className={`${btn} border border-line bg-card hover:bg-sand-100`}>
              {busy === "raw" ? "Exporting…" : "Export daily data"}
            </button>
          ) : (
            <Link href="/billing" className={lockedBtn} title="Raw daily data export is included from the Starter plan">
              <Lock size={14} aria-hidden="true" /> Daily data (Starter)
            </Link>
          )}
        </div>
      </SectionCard>

      {loading && !data ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}
      {data ? (
        <>
          <SectionCard title="Executive summary">
            <p className="text-sm leading-relaxed text-ink">{data.executiveSummary}</p>
          </SectionCard>

          <section aria-label="Report key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Followers" value={data.kpi.followers} compact includes={data.kpiPlatforms.followers} />
            <MetricCard label="Impressions" value={data.kpi.impressions} compact includes={data.kpiPlatforms.impressions} />
            <MetricCard label="Engagement" value={data.kpi.engagement} compact includes={data.kpiPlatforms.engagement} />
            <MetricCard label="Website Users" value={data.kpi.websiteUsers} compact />
          </section>

          <div className="grid gap-3 md:grid-cols-3">
            <InsightPill label="Key events" value={formatMetric(data.kpi.conversions)} />
            <InsightPill label="Sessions" value={formatMetric(data.kpi.websiteSessions)} />
            <InsightPill label="Bounce rate" value={formatMetric(data.website.bounceRate, "percent")} />
          </div>

          <SectionCard title="All Pages Comparison">
            <DataTable columns={allPagesCols} rows={data.allPagesComparison} rowKey={(r) => r.channelId} caption="All pages comparison" />
          </SectionCard>

          <SectionCard title="Top posts">
            {data.topPosts.length ? (
              <ol className="space-y-2">
                {data.topPosts.map((p, i) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 border-b border-line/70 py-2 text-sm last:border-0">
                    <span>
                      <span className="mr-2 text-muted">{i + 1}.</span>
                      {p.title}
                      <span className="ml-2 text-xs text-muted">{p.platform} · {p.channelName}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">{formatMetric(p.engagement)} eng</span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="No posts in this period" body="Top posts appear once a fetch has found content published in the selected range." />
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
