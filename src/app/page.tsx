"use client";

import { AppShell } from "@/components/layout/app-shell";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard, InsightPill } from "@/components/ui/section-card";
import { TrendChart } from "@/components/ui/charts";
import {
  ErrorState,
  LoadingState,
  useRangeFetch,
} from "@/components/hooks/use-range-fetch";
import { formatNumber } from "@/lib/metrics/periods";
import type { MetricDelta } from "@/lib/metrics/periods";
import { format } from "date-fns";

type OverviewData = {
  totals: {
    followers: number;
    impressions: number;
    reach: number;
    engagement: number;
    clicks: number;
    newFollowers: number;
    avgEngagementRate: number;
    websiteUsers: number;
    websiteSessions: number;
    deltas: Record<string, MetricDelta>;
  };
  bestPlatform?: { platform: string; engagementRate: number };
  bestLinkedIn?: { name: string; engagementRate: number; impressions: number };
  topPost?: {
    title: string | null;
    platform: string;
    channelName: string;
    engagement: number;
    publishedAt: string;
  };
  trend: { month: string; impressions: number; engagement: number }[];
};

export default function OverviewPage() {
  return (
    <AppShell
      title="Executive Overview"
      subtitle="Cross-channel performance at a glance"
    >
      <OverviewContent />
    </AppShell>
  );
}

function OverviewContent() {
  const { data, loading, error } = useRangeFetch<OverviewData>("/api/overview");

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "No data"} />;

  const t = data.totals;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Followers" value={t.followers} delta={t.deltas.followers} compact />
        <MetricCard label="Impressions" value={t.impressions} delta={t.deltas.impressions} compact />
        <MetricCard label="Reach" value={t.reach} delta={t.deltas.reach} compact />
        <MetricCard label="Engagement" value={t.engagement} delta={t.deltas.engagement} compact />
        <MetricCard label="Total Clicks" value={t.clicks} delta={t.deltas.clicks} compact />
        <MetricCard label="New Followers" value={t.newFollowers} delta={t.deltas.newFollowers} />
        <MetricCard
          label="Avg Engagement Rate"
          value={t.avgEngagementRate}
          delta={t.deltas.avgEngagementRate}
          format="percent"
        />
        <MetricCard
          label="Website Users"
          value={t.websiteUsers}
          delta={t.deltas.websiteUsers}
          compact
        />
        <MetricCard
          label="Sessions"
          value={t.websiteSessions}
          delta={t.deltas.websiteSessions}
          compact
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <InsightPill
          label="Best-performing platform"
          value={
            data.bestPlatform
              ? `${data.bestPlatform.platform} (${data.bestPlatform.engagementRate}% ER)`
              : "—"
          }
        />
        <InsightPill
          label="Best LinkedIn page"
          value={
            data.bestLinkedIn
              ? `${data.bestLinkedIn.name} (${data.bestLinkedIn.engagementRate}% ER)`
              : "—"
          }
        />
        <InsightPill
          label="Top post this period"
          value={
            data.topPost
              ? `${data.topPost.channelName} · ${formatNumber(data.topPost.engagement, true)} eng.`
              : "—"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionCard
            title="LinkedIn trend"
            subtitle="Monthly impressions & engagement across all company pages"
          >
            <TrendChart
              data={data.trend}
              xKey="month"
              series={[
                { key: "impressions", color: "#0b1f3a", name: "Impressions" },
                { key: "engagement", color: "#0d9488", name: "Engagement" },
              ]}
            />
          </SectionCard>
        </div>
        <div className="lg:col-span-2">
          <SectionCard title="Top post highlight" subtitle="Highest engagement in selected period">
            {data.topPost ? (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold tracking-wide text-teal-600 uppercase">
                  {data.topPost.platform} · {data.topPost.channelName}
                </p>
                <p className="font-display text-xl text-navy-900 leading-snug">
                  {data.topPost.title}
                </p>
                <p className="text-sm text-muted">
                  {format(new Date(data.topPost.publishedAt), "MMM d, yyyy")} ·{" "}
                  {formatNumber(data.topPost.engagement)} total engagement
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">No posts in this period.</p>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
