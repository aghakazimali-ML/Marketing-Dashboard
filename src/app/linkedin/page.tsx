"use client";

import { AppShell } from "@/components/layout/app-shell";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { TrendBadge } from "@/components/ui/metric-card";
import {
  ErrorState,
  LoadingState,
  useRangeFetch,
} from "@/components/hooks/use-range-fetch";
import { formatNumber } from "@/lib/metrics/periods";
import type { ComparedRow } from "@/lib/metrics/queries";
import Link from "next/link";

type LinkedInData = { rows: ComparedRow[] };

export default function LinkedInPage() {
  return (
    <AppShell
      title="LinkedIn Comparison"
      subtitle="Compare all NETS company pages side by side"
    >
      <LinkedInContent />
    </AppShell>
  );
}

function LinkedInContent() {
  const { data, loading, error } = useRangeFetch<LinkedInData>("/api/linkedin");

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "No data"} />;

  const rows = data.rows;
  const bestEr = [...rows].sort((a, b) => b.engagementRate - a.engagementRate)[0];
  const fastest = [...rows].sort((a, b) => b.newFollowers - a.newFollowers)[0];
  const mostImp = [...rows].sort((a, b) => b.impressions - a.impressions)[0];

  const columns: Column<ComparedRow>[] = [
    {
      key: "name",
      header: "LinkedIn Page",
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => <span className="font-medium text-navy-900">{r.name}</span>,
    },
    {
      key: "followers",
      header: "Followers",
      align: "right",
      sortable: true,
      sortValue: (r) => r.followers,
      render: (r) => formatNumber(r.followers),
    },
    {
      key: "newFollowers",
      header: "New Followers",
      align: "right",
      sortable: true,
      sortValue: (r) => r.newFollowers,
      render: (r) => (
        <span>
          +{formatNumber(r.newFollowers)}{" "}
          <TrendBadge delta={r.deltas.newFollowers} />
        </span>
      ),
    },
    {
      key: "impressions",
      header: "Impressions",
      align: "right",
      sortable: true,
      sortValue: (r) => r.impressions,
      render: (r) => formatNumber(r.impressions, true),
    },
    {
      key: "engagement",
      header: "Engagement",
      align: "right",
      sortable: true,
      sortValue: (r) => r.engagement,
      render: (r) => formatNumber(r.engagement, true),
    },
    {
      key: "er",
      header: "Eng. Rate",
      align: "right",
      sortable: true,
      sortValue: (r) => r.engagementRate,
      render: (r) => `${r.engagementRate.toFixed(1)}%`,
    },
    {
      key: "clicks",
      header: "Clicks",
      align: "right",
      sortable: true,
      sortValue: (r) => r.clicks,
      render: (r) => formatNumber(r.clicks),
    },
    {
      key: "growth",
      header: "Growth",
      align: "right",
      sortable: true,
      sortValue: (r) => r.growthPct,
      render: (r) => (
        <span className={r.growthPct >= 0 ? "text-up" : "text-down"}>
          {r.growthPct >= 0 ? "+" : ""}
          {r.growthPct.toFixed(1)}%
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <MetricCard
            label="Highest engagement rate"
            value={bestEr?.engagementRate ?? 0}
            format="percent"
            hint={bestEr?.name}
          />
          <MetricCard
            label="Fastest growing"
            value={fastest?.newFollowers ?? 0}
            hint={fastest?.name}
          />
          <MetricCard
            label="Most impressions"
            value={mostImp?.impressions ?? 0}
            compact
            hint={mostImp?.name}
          />
        </div>
        <Link
          href="/linkedin/battleboard"
          className="rounded-md bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
        >
          Open Battleboard →
        </Link>
      </div>

      <SectionCard
        title="Page comparison"
        subtitle="Click column headers to sort · highlighted row = highest engagement rate"
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.channelId}
          highlightBest
          getHighlightValue={(r) => r.engagementRate}
        />
      </SectionCard>
    </div>
  );
}
