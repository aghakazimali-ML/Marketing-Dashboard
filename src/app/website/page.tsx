"use client";

import { AppShell } from "@/components/layout/app-shell";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard } from "@/components/ui/section-card";
import { SimpleBarChart } from "@/components/ui/charts";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  ErrorState,
  LoadingState,
  useRangeFetch,
} from "@/components/hooks/use-range-fetch";
import { formatNumber } from "@/lib/metrics/periods";

type WebsitePayload = {
  website: {
    current: {
      users: number;
      sessions: number;
      newUsers: number;
      bounceRate: number;
      avgSessionDurationSec: number;
      conversions: number;
      goalCompletions: number;
      trafficSources: { source: string; users: number; sessions: number }[];
      topLandingPages: { page: string; sessions: number; bounceRate: number }[];
    };
  };
};

export default function WebsitePage() {
  return (
    <AppShell
      title="Website (GA4)"
      subtitle="Traffic, sources, landing pages, and conversions"
    >
      <WebsiteContent />
    </AppShell>
  );
}

function WebsiteContent() {
  const { data, loading, error } = useRangeFetch<WebsitePayload>(
    "/api/platform",
    { platform: "WEBSITE" }
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "No data"} />;

  const w = data.website.current;

  const sourceCols: Column<{ source: string; users: number; sessions: number }>[] = [
    {
      key: "source",
      header: "Source",
      render: (r) => <span className="font-medium">{r.source}</span>,
    },
    {
      key: "users",
      header: "Users",
      align: "right",
      sortable: true,
      sortValue: (r) => r.users,
      render: (r) => formatNumber(r.users),
    },
    {
      key: "sessions",
      header: "Sessions",
      align: "right",
      sortable: true,
      sortValue: (r) => r.sessions,
      render: (r) => formatNumber(r.sessions),
    },
  ];

  const pageCols: Column<{ page: string; sessions: number; bounceRate: number }>[] = [
    {
      key: "page",
      header: "Landing page",
      render: (r) => <span className="font-mono text-xs">{r.page}</span>,
    },
    {
      key: "sessions",
      header: "Sessions",
      align: "right",
      sortable: true,
      sortValue: (r) => r.sessions,
      render: (r) => formatNumber(r.sessions),
    },
    {
      key: "bounce",
      header: "Bounce rate",
      align: "right",
      sortable: true,
      sortValue: (r) => r.bounceRate,
      render: (r) => `${r.bounceRate.toFixed(1)}%`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Users" value={w.users} compact />
        <MetricCard label="Sessions" value={w.sessions} compact />
        <MetricCard label="New Users" value={w.newUsers} compact />
        <MetricCard
          label="Bounce Rate"
          value={w.bounceRate}
          format="percent"
        />
        <MetricCard
          label="Avg Session Duration"
          value={w.avgSessionDurationSec}
          format="duration"
        />
        <MetricCard label="Conversions" value={w.conversions} />
        <MetricCard
          label="Goal Completions"
          value={w.goalCompletions}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Traffic sources" subtitle="Which channels bring users to the site">
          <SimpleBarChart
            data={w.trafficSources}
            xKey="source"
            bars={[{ key: "users", color: "#0d9488", name: "Users" }]}
          />
          <div className="mt-4">
            <DataTable
              columns={sourceCols}
              rows={w.trafficSources.map((s) => ({ ...s, id: s.source }))}
              rowKey={(r) => r.source}
            />
          </div>
        </SectionCard>
        <SectionCard title="Top landing pages" subtitle="Entry points and bounce">
          <DataTable
            columns={pageCols}
            rows={w.topLandingPages.map((p) => ({ ...p, id: p.page }))}
            rowKey={(r) => r.page}
          />
        </SectionCard>
      </div>
    </div>
  );
}
