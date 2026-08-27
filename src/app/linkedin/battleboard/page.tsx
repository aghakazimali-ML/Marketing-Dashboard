"use client";

import { AppShell } from "@/components/layout/app-shell";
import { LeaderCard, SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  ErrorState,
  LoadingState,
  useRangeFetch,
} from "@/components/hooks/use-range-fetch";
import { formatNumber } from "@/lib/metrics/periods";
import type { ComparedRow } from "@/lib/metrics/queries";
import { format } from "date-fns";

type BattleData = {
  leaders: Record<string, ComparedRow | undefined>;
  bestPost?: {
    title: string | null;
    channelName: string;
    engagement: number;
    publishedAt: string;
    engagementRate: number;
  };
  rankings: {
    byEngagementRate: ComparedRow[];
    byGrowth: ComparedRow[];
    byImpressions: ComparedRow[];
    byClicks: ComparedRow[];
    byActivity: ComparedRow[];
  };
};

export default function BattleboardPage() {
  return (
    <AppShell
      title="LinkedIn Battleboard"
      subtitle="Ranked leaders across NETS company pages — see who is winning"
    >
      <BattleboardContent />
    </AppShell>
  );
}

function BattleboardContent() {
  const { data, loading, error } = useRangeFetch<BattleData>("/api/linkedin", {
    battleboard: "1",
  });

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "No data"} />;

  const L = data.leaders;

  const rankColumns: Column<ComparedRow & { place: number }>[] = [
    {
      key: "place",
      header: "#",
      render: (r) => (
        <span className="font-semibold text-teal-600">{r.place}</span>
      ),
    },
    {
      key: "name",
      header: "Page",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "er",
      header: "Eng. Rate",
      align: "right",
      render: (r) => `${r.engagementRate.toFixed(2)}%`,
    },
    {
      key: "growth",
      header: "Growth",
      align: "right",
      render: (r) => `+${r.newFollowers} (${r.growthPct.toFixed(1)}%)`,
    },
    {
      key: "imp",
      header: "Impressions",
      align: "right",
      render: (r) => formatNumber(r.impressions, true),
    },
    {
      key: "clicks",
      header: "Clicks",
      align: "right",
      render: (r) => formatNumber(r.clicks),
    },
    {
      key: "posts",
      header: "Posts",
      align: "right",
      render: (r) => r.postCount,
    },
  ];

  const ranked = data.rankings.byEngagementRate.map((r, i) => ({
    ...r,
    place: i + 1,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <LeaderCard
          title="Highest Engagement Rate"
          winner={L.engagementRate?.name ?? "—"}
          metric={L.engagementRate ? `${L.engagementRate.engagementRate.toFixed(2)}%` : "—"}
        />
        <LeaderCard
          title="Fastest Follower Growth"
          winner={L.followerGrowth?.name ?? "—"}
          metric={L.followerGrowth ? `+${formatNumber(L.followerGrowth.newFollowers)}` : "—"}
          detail={L.followerGrowth ? `${L.followerGrowth.growthPct.toFixed(1)}% growth` : undefined}
        />
        <LeaderCard
          title="Most Impressions"
          winner={L.impressions?.name ?? "—"}
          metric={L.impressions ? formatNumber(L.impressions.impressions, true) : "—"}
        />
        <LeaderCard
          title="Most Clicks"
          winner={L.clicks?.name ?? "—"}
          metric={L.clicks ? formatNumber(L.clicks.clicks) : "—"}
        />
        <LeaderCard
          title="Most Active"
          winner={L.mostActive?.name ?? "—"}
          metric={L.mostActive ? `${L.mostActive.postCount} posts` : "—"}
          detail="Posting frequency in period"
        />
        <LeaderCard
          title="Best Average Performance"
          winner={L.bestAverage?.name ?? "—"}
          metric={L.bestAverage ? `${L.bestAverage.engagementRate.toFixed(2)}% ER` : "—"}
          detail="Engagement rate weighted by reach"
        />
        <div className="md:col-span-2">
          <LeaderCard
            title="Best Performing Post"
            winner={data.bestPost?.channelName ?? "—"}
            metric={
              data.bestPost
                ? `${formatNumber(data.bestPost.engagement)} eng · ${data.bestPost.engagementRate.toFixed(1)}%`
                : "—"
            }
            detail={
              data.bestPost
                ? `${data.bestPost.title ?? ""} · ${format(new Date(data.bestPost.publishedAt), "MMM d, yyyy")}`
                : undefined
            }
          />
        </div>
      </div>

      <SectionCard
        title="Full ranking board"
        subtitle="Ordered by engagement rate — pages needing attention sit at the bottom"
      >
        <DataTable
          columns={rankColumns}
          rows={ranked}
          rowKey={(r) => r.channelId}
        />
      </SectionCard>
    </div>
  );
}
