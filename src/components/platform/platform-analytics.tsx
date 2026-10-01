"use client";

import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  ErrorState,
  LoadingState,
  useRangeFetch,
} from "@/components/hooks/use-range-fetch";
import { formatNumber } from "@/lib/metrics/periods";
import type { ComparedRow } from "@/lib/metrics/queries";
import { format } from "date-fns";

type PlatformPayload = {
  rows: ComparedRow[];
  posts: {
    id: string;
    title: string | null;
    thumbnailUrl: string | null;
    channelName: string;
    publishedAt: string;
    likes: number;
    comments: number;
    shares: number;
    impressions: number;
    reach: number;
    clicks: number;
    engagementRate: number;
    views: number;
    saves: number;
    postType: string | null;
  }[];
};

export function PlatformAnalytics({
  platform,
  title,
  subtitle,
  extraMetrics,
}: {
  platform: string;
  title: string;
  subtitle: string;
  extraMetrics?: "facebook" | "instagram" | "youtube";
}) {
  const { data, loading, error } = useRangeFetch<PlatformPayload>(
    "/api/platform",
    { platform }
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "No data"} />;

  const rows = data.rows;
  const totals = rows.reduce(
    (acc, r) => {
      acc.followers += r.followers;
      acc.newFollowers += r.newFollowers;
      acc.impressions += r.impressions;
      acc.reach += r.reach;
      acc.engagement += r.engagement;
      acc.clicks += r.clicks;
      acc.likes += r.likes;
      acc.comments += r.comments;
      acc.shares += r.shares;
      acc.saves += r.saves;
      acc.profileVisits += r.profileVisits;
      acc.videoViews += r.videoViews;
      acc.watchTimeMin += r.watchTimeMin;
      acc.returningViewers += r.returningViewers;
      acc.avgViewDurSec += r.avgViewDurSec;
      return acc;
    },
    {
      followers: 0,
      newFollowers: 0,
      impressions: 0,
      reach: 0,
      engagement: 0,
      clicks: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      profileVisits: 0,
      videoViews: 0,
      watchTimeMin: 0,
      returningViewers: 0,
      avgViewDurSec: 0,
    }
  );
  const er =
    totals.impressions > 0
      ? (totals.engagement / totals.impressions) * 100
      : 0;

  const columns: Column<ComparedRow>[] = [
    {
      key: "name",
      header: "Page",
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => <span className="font-medium">{r.name}</span>,
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
      key: "new",
      header: "New",
      align: "right",
      sortable: true,
      sortValue: (r) => r.newFollowers,
      render: (r) => `+${formatNumber(r.newFollowers)}`,
    },
    {
      key: "reach",
      header: "Reach",
      align: "right",
      sortable: true,
      sortValue: (r) => r.reach,
      render: (r) => formatNumber(r.reach, true),
    },
    {
      key: "imp",
      header: "Impressions",
      align: "right",
      sortable: true,
      sortValue: (r) => r.impressions,
      render: (r) => formatNumber(r.impressions, true),
    },
    {
      key: "eng",
      header: "Engagement",
      align: "right",
      sortable: true,
      sortValue: (r) => r.engagement,
      render: (r) => formatNumber(r.engagement, true),
    },
    {
      key: "reactions",
      header: "Reactions",
      align: "right",
      sortable: true,
      sortValue: (r) => r.likes,
      render: (r) => formatNumber(r.likes),
    },
    {
      key: "comments",
      header: "Comments",
      align: "right",
      sortable: true,
      sortValue: (r) => r.comments,
      render: (r) => formatNumber(r.comments),
    },
    {
      key: "shares",
      header: "Shares",
      align: "right",
      sortable: true,
      sortValue: (r) => r.shares,
      render: (r) => formatNumber(r.shares),
    },
    {
      key: "clicks",
      header: "Link Clicks",
      align: "right",
      sortable: true,
      sortValue: (r) => r.clicks,
      render: (r) => formatNumber(r.clicks),
    },
    {
      key: "growth",
      header: "Growth %",
      align: "right",
      sortable: true,
      sortValue: (r) => r.growthPct,
      render: (r) => (
        <span className="inline-flex items-center gap-1">
          {r.growthPct.toFixed(1)}%
        </span>
      ),
    },
  ];

  const reels = data.posts.filter((p) => p.postType === "reel");
  const videos = data.posts.filter((p) => p.postType === "video");

  return (
    <div className="space-y-6">
      <p className="sr-only">{title} — {subtitle}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Followers" value={totals.followers} compact />
        <MetricCard label="Reach" value={totals.reach} compact />
        <MetricCard label="Impressions" value={totals.impressions} compact />
        <MetricCard label="Engagement" value={totals.engagement} compact />
        {extraMetrics === "facebook" && (
          <>
            <MetricCard label="Reactions" value={totals.likes} />
            <MetricCard label="Comments" value={totals.comments} />
            <MetricCard label="Shares" value={totals.shares} />
            <MetricCard label="Link Clicks" value={totals.clicks} />
          </>
        )}
        {extraMetrics === "instagram" && (
          <>
            <MetricCard label="Engagement Rate" value={er} format="percent" />
            <MetricCard label="Profile Visits" value={totals.profileVisits} />
            <MetricCard label="Saves" value={totals.saves} />
            <MetricCard label="Shares" value={totals.shares} />
          </>
        )}
        {extraMetrics === "youtube" && (
          <>
            <MetricCard label="Subscribers" value={totals.followers} />
            <MetricCard label="Views" value={totals.videoViews} compact />
            <MetricCard label="Watch Time (min)" value={Math.round(totals.watchTimeMin)} compact />
            <MetricCard
              label="Avg View Duration"
              value={totals.avgViewDurSec / Math.max(rows.length, 1)}
              format="duration"
            />
            <MetricCard label="Returning Viewers" value={totals.returningViewers} />
            <MetricCard
              label="CTR"
              value={
                totals.impressions > 0
                  ? (totals.clicks / totals.impressions) * 100
                  : 0
              }
              format="percent"
            />
          </>
        )}
      </div>

      {rows.length > 1 && (
        <SectionCard title="Page comparison" subtitle={subtitle}>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.channelId} />
        </SectionCard>
      )}

      {extraMetrics === "instagram" && (
        <SectionCard title="Reel performance" subtitle="Reels published in this period">
          <PostMiniTable posts={reels.length ? reels : data.posts.slice(0, 5)} />
        </SectionCard>
      )}

      {extraMetrics === "youtube" && (
        <SectionCard title="Top videos" subtitle="Best performing videos this period">
          <PostMiniTable
            posts={[...(videos.length ? videos : data.posts)]
              .sort((a, b) => b.views - a.views)
              .slice(0, 8)}
            showViews
          />
        </SectionCard>
      )}

      {(extraMetrics === "facebook" || extraMetrics === "instagram") && (
        <SectionCard title="Top posts" subtitle="Highest engagement">
          <PostMiniTable
            posts={[...data.posts]
              .sort((a, b) => b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares))
              .slice(0, 8)}
          />
        </SectionCard>
      )}
    </div>
  );
}

function PostMiniTable({
  posts,
  showViews,
}: {
  posts: PlatformPayload["posts"];
  showViews?: boolean;
}) {
  if (!posts.length) {
    return <p className="text-sm text-muted">No posts in this period.</p>;
  }
  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <div
          key={p.id}
          className="flex gap-3 rounded-md border border-line p-3"
        >
          <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded bg-sand-100">
            {p.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-navy-900">{p.title}</p>
            <p className="text-xs text-muted">
              {p.channelName} · {format(new Date(p.publishedAt), "MMM d, yyyy")}
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted">
              {showViews && <>{formatNumber(p.views, true)} views · </>}
              {formatNumber(p.likes)} likes · {formatNumber(p.comments)} comments ·{" "}
              {formatNumber(p.shares)} shares · {p.engagementRate.toFixed(1)}% ER
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
