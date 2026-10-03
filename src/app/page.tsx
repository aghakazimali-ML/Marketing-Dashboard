"use client";

import { useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard, InsightPill } from "@/components/ui/section-card";
import { TrendChart } from "@/components/ui/charts";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { FirstRunChecklist } from "@/components/ui/first-run";
import { PlatformBadge, platformLabel } from "@/components/ui/platform-badge";
import { ErrorState, LoadingState, useRangeFetch } from "@/components/hooks/use-range-fetch";
import { useAuth } from "@/components/providers/auth-provider";
import { formatMetric } from "@/lib/metrics/format";
import { FORMULAS } from "@/lib/metrics/catalog";

type Total = { value: number | null; platforms: string[]; delta?: number | null };
type OverviewData = {
  hasChannels: boolean;
  lastSuccessAt: string | null;
  clamped: boolean;
  historyDays: number | null;
  comparisonLocked: boolean;
  postsLocked: boolean;
  totals: Record<"followers" | "impressions" | "reach" | "engagement" | "clicks" | "newFollowers" | "engagementRate" | "websiteUsers" | "websiteSessions", Total>;
  byPlatform: {
    platform: string;
    connected: boolean;
    followers: number | null;
    newFollowers: number | null;
    impressions: number | null;
    engagement: number | null;
    reach: number | null;
    clicks: number | null;
    engagementRate: number | null;
  }[];
  bestPlatform: { platform: string; engagementRate: number | null } | null;
  bestLinkedIn: { name: string; engagementRate: number | null; impressions: number | null } | null;
  topPost: { title: string | null; platform: string; channelName: string; engagement: number | null; publishedAt: string } | null;
  series: { label: string; impressions: number | null; engagement: number | null; followers: number | null }[];
  grain: "day" | "week" | "month";
  websiteConnected: boolean;
};

const PLATFORM_OPTIONS = ["", "LINKEDIN", "FACEBOOK", "INSTAGRAM", "YOUTUBE"];
type SeriesKey = "impressions" | "engagement" | "followers";
const SERIES: Record<SeriesKey, { name: string; color: string; dashed?: boolean }> = {
  impressions: { name: "Impressions", color: "var(--chart-1)" },
  engagement: { name: "Engagement", color: "var(--chart-2)", dashed: true },
  followers: { name: "Followers", color: "var(--chart-3)" },
};

export default function OverviewPage() {
  return (
    <AppShell title="Executive Overview" subtitle="Cross-channel performance at a glance">
      <OverviewContent />
    </AppShell>
  );
}

function OverviewContent() {
  const user = useAuth();
  const [platform, setPlatform] = useState("");
  const [grain, setGrain] = useState<"day" | "week" | "month">("day");
  const [shown, setShown] = useState<Record<SeriesKey, boolean>>({ impressions: true, engagement: true, followers: false });

  const { data, loading, error, retry } = useRangeFetch<OverviewData>("/api/overview", { grain, ...(platform ? { platform } : {}) });

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "No data"} onRetry={retry} />;

  const t = data.totals;
  const connectedSocial = data.byPlatform.some((p) => p.connected);
  const noData = (key: keyof OverviewData["totals"]) => (key.startsWith("website") ? !data.websiteConnected : !connectedSocial);
  const reasonOf = (key: keyof OverviewData["totals"]) => (noData(key) ? ("not_connected" as const) : ("no_data" as const));
  const card = (label: string, key: keyof OverviewData["totals"], opts: { format?: "number" | "percent"; compact?: boolean; info?: string } = {}) => (
    <MetricCard
      label={label}
      value={t[key].value}
      format={opts.format}
      compact={opts.compact}
      delta={t[key].delta}
      reason={reasonOf(key)}
      info={opts.info}
      includes={t[key].platforms.length > 1 || (t[key].platforms.length === 1 && connectedSocial && data.byPlatform.filter((p) => p.connected).length > 1) ? t[key].platforms : undefined}
    />
  );

  const hasAnyValue = data.series.length > 0 || Object.values(t).some((v) => v.value !== null);
  const seriesKeys = (Object.keys(SERIES) as SeriesKey[]).filter((k) => shown[k]);

  const platformColumns: Column<OverviewData["byPlatform"][number]>[] = [
    { key: "platform", header: "Platform", render: (r) => <PlatformBadge platform={r.platform} /> },
    { key: "followers", header: "Followers", align: "right", sortable: true, sortValue: (r) => r.followers, render: (r) => formatMetric(r.followers) },
    { key: "new", header: "New", align: "right", sortable: true, sortValue: (r) => r.newFollowers, render: (r) => formatMetric(r.newFollowers, "signed") },
    { key: "imp", header: "Impressions", align: "right", sortable: true, sortValue: (r) => r.impressions, render: (r) => formatMetric(r.impressions, "number", true) },
    { key: "eng", header: "Engagement", align: "right", sortable: true, sortValue: (r) => r.engagement, render: (r) => formatMetric(r.engagement, "number", true) },
    { key: "er", header: "Eng. rate", align: "right", sortable: true, sortValue: (r) => r.engagementRate, render: (r) => (r.connected ? formatMetric(r.engagementRate, "percent") : "Not connected") },
  ];

  return (
    <div className="space-y-6">
      {!data.hasChannels || !hasAnyValue ? (
        <FirstRunChecklist hasChannels={data.hasChannels} hasData={hasAnyValue} isAdmin={user?.role === "ADMIN"} />
      ) : null}

      {data.clamped && data.historyDays !== null ? (
        <p role="status" className="rounded-md border border-line bg-sand-50 px-3 py-2 text-xs text-muted">
          Your plan includes {data.historyDays} days of history, so the range was shortened. <a className="font-medium text-teal-600 underline" href="/billing">See plans</a>
        </p>
      ) : null}

      <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {card("Total Followers", "followers", { compact: true, info: FORMULAS.followers })}
        {card("Impressions", "impressions", { compact: true, info: "Views/impressions as each platform reports them. YouTube does not provide impressions, so it is excluded." })}
        {card("Reach", "reach", { compact: true, info: "Unique accounts reached, where the platform provides it." })}
        {card("Engagement", "engagement", { compact: true, info: "LinkedIn: likes+comments+shares+clicks · Instagram: likes+comments+shares+saves · YouTube: likes+comments+shares." })}
        {card("Total Clicks", "clicks", { compact: true })}
        {card("New Followers", "newFollowers", { info: FORMULAS.newFollowers })}
        {card("Avg Engagement Rate", "engagementRate", { format: "percent", info: "Engagement ÷ impressions across platforms that report both. Instagram is shown on its own page (÷ reach)." })}
        {card("Website Users", "websiteUsers", { compact: true, info: "Sum of daily active users (a person visiting on several days counts once per day)." })}
        {card("Sessions", "websiteSessions", { compact: true })}
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <InsightPill label="Best-performing platform" value={data.bestPlatform ? `${platformLabel(data.bestPlatform.platform)} (${formatMetric(data.bestPlatform.engagementRate, "percent")} ER)` : "—"} />
        <InsightPill label="Best LinkedIn page" value={data.bestLinkedIn ? `${data.bestLinkedIn.name} (${formatMetric(data.bestLinkedIn.engagementRate, "percent")} ER)` : "—"} />
        <InsightPill label="Top post this period" value={data.topPost ? `${data.topPost.channelName} · ${formatMetric(data.topPost.engagement, "number", true)} eng.` : data.postsLocked ? "Post analytics need Starter" : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionCard title="Performance trend" subtitle="Daily rows summed across the selected channels">
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <label className="text-xs text-muted">
                <span className="mb-1 block font-semibold uppercase tracking-wide">Platform</span>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink">
                  {PLATFORM_OPTIONS.map((p) => (
                    <option key={p || "all"} value={p}>{p ? platformLabel(p) : "All platforms"}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                <span className="mb-1 block font-semibold uppercase tracking-wide">Grain</span>
                <select value={grain} onChange={(e) => setGrain(e.target.value as typeof grain)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink">
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
              </label>
              <fieldset className="flex items-center gap-3 text-sm">
                <legend className="sr-only">Series</legend>
                {(Object.keys(SERIES) as SeriesKey[]).map((k) => (
                  <label key={k} className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={shown[k]} onChange={(e) => setShown((s) => ({ ...s, [k]: e.target.checked }))} />
                    {SERIES[k].name}
                  </label>
                ))}
              </fieldset>
            </div>
            {data.series.length ? (
              <TrendChart
                data={data.series}
                xKey="label"
                series={seriesKeys.map((k) => ({ key: k, color: SERIES[k].color, name: SERIES[k].name, dashed: SERIES[k].dashed }))}
                summary={`${seriesKeys.map((k) => SERIES[k].name).join(", ")} for ${platform ? platformLabel(platform) : "all platforms"}, ${grain === "day" ? "daily" : grain === "week" ? "weekly" : "monthly"}.`}
              />
            ) : (
              <EmptyState title="No trend data yet" body="Fetch data for a connected channel to see daily history here." action={user?.role === "ADMIN" ? { label: "Connect a channel", href: "/sync" } : undefined} />
            )}
          </SectionCard>
        </div>
        <div className="lg:col-span-2">
          <SectionCard title="Top post highlight" subtitle="Highest engagement in selected period">
            {data.topPost ? (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold tracking-wide text-teal-600 uppercase">
                  {platformLabel(data.topPost.platform)} · {data.topPost.channelName}
                </p>
                <p className="font-display text-xl leading-snug text-navy-900">{data.topPost.title}</p>
                <p className="text-sm text-muted">
                  {format(new Date(data.topPost.publishedAt), "MMM d, yyyy")} · {formatMetric(data.topPost.engagement)} total engagement
                </p>
              </div>
            ) : (
              <EmptyState title="No posts to show" body={data.postsLocked ? "Post analytics are included from the Starter plan." : "Posts appear after a fetch finds content published in this period."} action={data.postsLocked ? { label: "See plans", href: "/billing" } : undefined} />
            )}
          </SectionCard>
        </div>
      </div>

      <SectionCard title="By platform" subtitle="“—” means the platform does not provide that metric; it is never counted as zero.">
        <DataTable columns={platformColumns} rows={data.byPlatform} rowKey={(r) => r.platform} caption="Metrics by platform" />
      </SectionCard>
    </div>
  );
}
