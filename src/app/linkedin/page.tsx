"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { ErrorState, LoadingState, useRangeFetch } from "@/components/hooks/use-range-fetch";
import { useAuth } from "@/components/providers/auth-provider";
import { useDateRange } from "@/components/providers/date-range-provider";
import { formatMetric } from "@/lib/metrics/format";
import { FORMULAS } from "@/lib/metrics/catalog";
import { leaderBy } from "@/lib/metrics/rank";
import type { ComparedRow } from "@/lib/metrics/queries";

type LinkedInData = { rows: ComparedRow[] };

export default function LinkedInPage() {
  return (
    <AppShell title="LinkedIn Comparison" subtitle="Compare connected LinkedIn pages side by side">
      <LinkedInContent />
    </AppShell>
  );
}

function LinkedInContent() {
  const user = useAuth();
  const { search } = useDateRange();
  const { data, loading, error, retry } = useRangeFetch<LinkedInData>("/api/linkedin");

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "No data"} onRetry={retry} />;

  const rows = data.rows;
  if (!rows.length) {
    return (
      <EmptyState
        title="No LinkedIn pages yet"
        body="Connect a LinkedIn organization page to compare followers, impressions and engagement."
        action={user?.role === "ADMIN" ? { label: "Connect LinkedIn", href: "/sync" } : undefined}
      />
    );
  }

  const bestEr = leaderBy(rows, (r) => r.engagementRate);
  const fastest = leaderBy(rows, (r) => r.newFollowers);
  const mostImp = leaderBy(rows, (r) => r.impressions);
  const reconnect = rows.filter((r) => r.connectionStatus === "NEEDS_RECONNECT");

  const columns: Column<ComparedRow>[] = [
    { key: "name", header: "LinkedIn Page", sortable: true, sortValue: (r) => r.name, render: (r) => <span className="font-medium text-navy-900">{r.name}</span> },
    { key: "followers", header: "Followers", align: "right", sortable: true, sortValue: (r) => r.followers, render: (r) => formatMetric(r.followers) },
    { key: "newFollowers", header: "New Followers", align: "right", sortable: true, sortValue: (r) => r.newFollowers, render: (r) => formatMetric(r.newFollowers, "signed") },
    { key: "impressions", header: "Impressions", align: "right", sortable: true, sortValue: (r) => r.impressions, render: (r) => formatMetric(r.impressions, "number", true) },
    { key: "engagement", header: "Engagement", align: "right", sortable: true, sortValue: (r) => r.engagement, render: (r) => formatMetric(r.engagement, "number", true) },
    { key: "er", header: "Eng. Rate", align: "right", sortable: true, sortValue: (r) => r.engagementRate, render: (r) => formatMetric(r.engagementRate, "percent") },
    { key: "clicks", header: "Clicks", align: "right", sortable: true, sortValue: (r) => r.clicks, render: (r) => formatMetric(r.clicks) },
    {
      key: "growth",
      header: "Growth",
      align: "right",
      sortable: true,
      sortValue: (r) => r.growthPct,
      render: (r) =>
        r.growthPct === null ? "—" : <span className={r.growthPct >= 0 ? "text-up" : "text-down"}>{r.growthPct >= 0 ? "▲ +" : "▼ "}{r.growthPct.toFixed(1)}%</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {reconnect.length ? (
        <div role="alert" className="rounded-lg border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-warn">
          {reconnect.map((r) => r.name).join(", ")} needs to be reconnected. <Link href="/sync" className="font-medium underline">Reconnect</Link>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <MetricCard label="Highest engagement rate" value={bestEr?.engagementRate ?? null} format="percent" hint={bestEr?.name} info={FORMULAS.engagementRate} />
          <MetricCard label="Fastest growing" value={fastest?.newFollowers ?? null} format="signed" hint={fastest?.name} info={FORMULAS.newFollowers} />
          <MetricCard label="Most impressions" value={mostImp?.impressions ?? null} compact hint={mostImp?.name} />
        </div>
        <Link href={`/linkedin/battleboard${search}`} className="rounded-md bg-navy-900 px-4 py-2.5 text-sm font-medium text-on-accent hover:opacity-90">
          Open Battleboard →
        </Link>
      </div>

      <SectionCard title="Page comparison" subtitle="Sort with the column headers · highlighted row = highest engagement rate">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.channelId} highlightBest getHighlightValue={(r) => r.engagementRate} caption="LinkedIn page comparison" />
      </SectionCard>
    </div>
  );
}
