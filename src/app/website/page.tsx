"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard } from "@/components/ui/section-card";
import { SimpleBarChart } from "@/components/ui/charts";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { ErrorState, LoadingState, useRangeFetch } from "@/components/hooks/use-range-fetch";
import { useAuth } from "@/components/providers/auth-provider";
import { formatMetric } from "@/lib/metrics/format";
import { deltaPct } from "@/lib/metrics/totals";
import type { WebsiteMetrics } from "@/lib/metrics/queries";

type WebsitePayload = { website: { current: WebsiteMetrics; previous: WebsiteMetrics | null }; comparisonLocked: boolean };

export default function WebsitePage() {
  return (
    <AppShell title="Website (GA4)" subtitle="Traffic, sources, landing pages, and key events">
      <WebsiteContent />
    </AppShell>
  );
}

function WebsiteContent() {
  const user = useAuth();
  const { data, loading, error, retry } = useRangeFetch<WebsitePayload>("/api/platform", { platform: "WEBSITE" });
  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "No data"} onRetry={retry} />;

  const w = data.website.current;
  const prev = data.website.previous;
  if (!w.connected) {
    return (
      <EmptyState
        title="Connect Google Analytics 4"
        body="Add your GA4 property to see traffic, sources and landing pages."
        action={user?.role === "ADMIN" ? { label: "Connect GA4", href: "/sync" } : undefined}
      />
    );
  }

  const d = (k: "users" | "sessions" | "newUsers" | "bounceRate" | "avgSessionDurationSec" | "conversions") =>
    prev ? deltaPct(w[k], prev[k]) : undefined;
  const reason = "no_data" as const;

  const sourceCols: Column<WebsiteMetrics["trafficSources"][number]>[] = [
    { key: "source", header: "Source", render: (r) => <span className="font-medium">{r.source}</span> },
    { key: "users", header: "Users", align: "right", sortable: true, sortValue: (r) => r.users, render: (r) => formatMetric(r.users) },
    { key: "sessions", header: "Sessions", align: "right", sortable: true, sortValue: (r) => r.sessions, render: (r) => formatMetric(r.sessions) },
  ];
  const pageCols: Column<WebsiteMetrics["topLandingPages"][number]>[] = [
    { key: "page", header: "Landing page", render: (r) => <span className="font-mono text-xs">{r.page}</span> },
    { key: "sessions", header: "Sessions", align: "right", sortable: true, sortValue: (r) => r.sessions, render: (r) => formatMetric(r.sessions) },
    { key: "bounce", header: "Bounce rate", align: "right", sortable: true, sortValue: (r) => r.bounceRate, render: (r) => formatMetric(r.bounceRate, "percent") },
  ];

  return (
    <div className="space-y-6">
      <section aria-label="Website key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Users" value={w.users} compact delta={d("users")} reason={reason} info="Source: GA4 activeUsers, summed over days (a person visiting on several days counts once per day)." />
        <MetricCard label="Sessions" value={w.sessions} compact delta={d("sessions")} reason={reason} info="Source: GA4 sessions." />
        <MetricCard label="New Users" value={w.newUsers} compact delta={d("newUsers")} reason={reason} info="Source: GA4 newUsers." />
        <MetricCard label="Bounce Rate" value={w.bounceRate} format="percent" delta={d("bounceRate")} reason={reason} info="Source: GA4 bounceRate. Weighted by sessions across days." />
        <MetricCard label="Avg Session Duration" value={w.avgSessionDurationSec} format="duration" delta={d("avgSessionDurationSec")} reason={reason} info="Source: GA4 averageSessionDuration. Weighted by sessions." />
        <MetricCard label="Key Events" value={w.conversions} delta={d("conversions")} reason={reason} info="Source: GA4 keyEvents (formerly “conversions”)." />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Traffic sources" subtitle="Default channel group of each session">
          {w.trafficSources.length ? (
            <>
              <SimpleBarChart data={w.trafficSources.map((s) => ({ ...s }))} xKey="source" bars={[{ key: "sessions", color: "var(--chart-2)", name: "Sessions" }]} />
              <div className="mt-4">
                <DataTable columns={sourceCols} rows={w.trafficSources} rowKey={(r) => r.source} caption="Traffic sources" />
              </div>
            </>
          ) : (
            <EmptyState title="No traffic source data" body="Run a fetch for your GA4 property to load sources for this period." />
          )}
        </SectionCard>
        <SectionCard title="Top landing pages" subtitle="Entry points and bounce rate">
          {w.topLandingPages.length ? (
            <DataTable columns={pageCols} rows={w.topLandingPages} rowKey={(r) => r.page} caption="Top landing pages" />
          ) : (
            <EmptyState title="No landing page data" body="Run a fetch for your GA4 property to load landing pages for this period." />
          )}
        </SectionCard>
      </div>
      {data.comparisonLocked ? (
        <p className="text-xs text-muted">Period comparison is included from the Starter plan. <Link className="text-teal-600 underline" href="/billing">See plans</Link></p>
      ) : null}
    </div>
  );
}
