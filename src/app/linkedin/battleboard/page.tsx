"use client";

import { format } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import { LeaderCard, SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import { ErrorState, LoadingState, useRangeFetch } from "@/components/hooks/use-range-fetch";
import { useEntitlements } from "@/components/providers/entitlements-provider";
import { formatMetric } from "@/lib/metrics/format";
import type { ComparedRow } from "@/lib/metrics/queries";

type BattleData = {
  leaders: Record<string, ComparedRow | undefined>;
  bestPost?: { title: string | null; channelName: string; engagement: number | null; publishedAt: string; engagementRate: number | null };
  rankings: { byEngagementRate: ComparedRow[] };
};

export default function BattleboardPage() {
  return (
    <AppShell title="LinkedIn Battleboard" subtitle="Ranked leaders across connected LinkedIn pages">
      <BattleboardGate />
    </AppShell>
  );
}

function BattleboardGate() {
  const { has } = useEntitlements();
  if (!has("battleboard")) return <UpgradePrompt feature="battleboard" />;
  return <BattleboardContent />;
}

function BattleboardContent() {
  const { data, loading, error, retry } = useRangeFetch<BattleData>("/api/linkedin", { battleboard: "1" });
  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "No data"} onRetry={retry} />;
  if (!data.rankings.byEngagementRate.length) {
    return <EmptyState title="No LinkedIn pages yet" body="Connect LinkedIn pages to see how they rank against each other." action={{ label: "Connect LinkedIn", href: "/sync" }} />;
  }

  const L = data.leaders;
  const rankColumns: Column<ComparedRow & { place: number | null }>[] = [
    { key: "place", header: "#", render: (r) => <span className="font-semibold text-teal-600">{r.place ?? "–"}</span> },
    { key: "name", header: "Page", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "er", header: "Eng. Rate", align: "right", render: (r) => formatMetric(r.engagementRate, "percent") },
    { key: "growth", header: "Growth", align: "right", render: (r) => `${formatMetric(r.newFollowers, "signed")} (${formatMetric(r.growthPct, "percent")})` },
    { key: "imp", header: "Impressions", align: "right", render: (r) => formatMetric(r.impressions, "number", true) },
    { key: "clicks", header: "Clicks", align: "right", render: (r) => formatMetric(r.clicks) },
    { key: "posts", header: "Posts", align: "right", render: (r) => formatMetric(r.postCount) },
  ];

  // Pages without an engagement rate are listed unranked, after the ranked ones.
  let place = 0;
  const ranked = data.rankings.byEngagementRate.map((r) => ({ ...r, place: r.engagementRate === null ? null : ++place }));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <LeaderCard title="Highest Engagement Rate" winner={L.engagementRate?.name ?? "—"} metric={formatMetric(L.engagementRate?.engagementRate, "percent")} />
        <LeaderCard title="Fastest Follower Growth" winner={L.followerGrowth?.name ?? "—"} metric={formatMetric(L.followerGrowth?.newFollowers, "signed")} detail={L.followerGrowth ? `${formatMetric(L.followerGrowth.growthPct, "percent")} growth` : undefined} />
        <LeaderCard title="Most Impressions" winner={L.impressions?.name ?? "—"} metric={formatMetric(L.impressions?.impressions, "number", true)} />
        <LeaderCard title="Most Clicks" winner={L.clicks?.name ?? "—"} metric={formatMetric(L.clicks?.clicks)} />
        <LeaderCard title="Most Active" winner={L.mostActive?.name ?? "—"} metric={L.mostActive ? `${formatMetric(L.mostActive.postCount)} posts` : "—"} detail="Posts published in the period" />
        <LeaderCard title="Best Average Performance" winner={L.bestAverage?.name ?? "—"} metric={L.bestAverage ? `${formatMetric(L.bestAverage.engagementRate, "percent")} ER` : "—"} detail="Engagement rate weighted by impressions" />
        <div className="md:col-span-2">
          <LeaderCard
            title="Best Performing Post"
            winner={data.bestPost?.channelName ?? "—"}
            metric={data.bestPost ? `${formatMetric(data.bestPost.engagement)} eng · ${formatMetric(data.bestPost.engagementRate, "percent")}` : "—"}
            detail={data.bestPost ? `${data.bestPost.title ?? ""} · ${format(new Date(data.bestPost.publishedAt), "MMM d, yyyy")}` : undefined}
          />
        </div>
      </div>
      <SectionCard title="Full ranking board" subtitle="Ordered by engagement rate: pages needing attention sit at the bottom">
        <DataTable columns={rankColumns} rows={ranked} rowKey={(r) => r.channelId} caption="LinkedIn ranking board" />
      </SectionCard>
    </div>
  );
}
