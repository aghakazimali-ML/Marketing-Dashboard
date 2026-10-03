"use client";

import Link from "next/link";
import { format } from "date-fns";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { PlatformBadge, platformLabel } from "@/components/ui/platform-badge";
import { ErrorState, LoadingState, useRangeFetch } from "@/components/hooks/use-range-fetch";
import { useAuth } from "@/components/providers/auth-provider";
import { formatMetric, type MetricFormat } from "@/lib/metrics/format";
import { FORMULAS, PLATFORM_METRICS, isMetricProvided, type MetricKey } from "@/lib/metrics/catalog";
import { deltaPct, totalFor, weightedAvg } from "@/lib/metrics/totals";
import { engagementRateFor, ratioPct } from "@/lib/metrics/aggregate";
import type { ComparedRow, PostRow } from "@/lib/metrics/queries";
import type { Platform } from "@/generated/prisma/client";

type PostJson = Omit<PostRow, "publishedAt"> & { publishedAt: string };
type PlatformPayload = {
  rows: ComparedRow[];
  previousRows: ComparedRow[] | null;
  posts: PostJson[];
  postsLocked: boolean;
  clamped: boolean;
};

type CardDef = { key: MetricKey; label: string; format?: MetricFormat; compact?: boolean };

const CARDS: Record<"facebook" | "instagram" | "youtube", CardDef[]> = {
  facebook: [
    { key: "followers", label: "Followers", compact: true },
    { key: "newFollowers", label: "New Followers", format: "signed" },
    { key: "reach", label: "Reach (unique viewers)", compact: true },
    { key: "impressions", label: "Views", compact: true },
    { key: "engagement", label: "Engagement", compact: true },
    { key: "engagementRate", label: "Engagement Rate", format: "percent" },
    { key: "postCount", label: "Posts published" },
  ],
  instagram: [
    { key: "followers", label: "Followers", compact: true },
    { key: "newFollowers", label: "New Followers", format: "signed" },
    { key: "reach", label: "Reach", compact: true },
    { key: "impressions", label: "Views", compact: true },
    { key: "engagement", label: "Engagement", compact: true },
    { key: "engagementRate", label: "Engagement Rate", format: "percent" },
    { key: "likes", label: "Likes" },
    { key: "comments", label: "Comments" },
    { key: "shares", label: "Shares" },
    { key: "saves", label: "Saves" },
    { key: "profileVisits", label: "Profile Visits" },
    { key: "clicks", label: "Link Taps" },
  ],
  youtube: [
    { key: "followers", label: "Subscribers", compact: true },
    { key: "newFollowers", label: "Net New Subscribers", format: "signed" },
    { key: "videoViews", label: "Views", compact: true },
    { key: "watchTimeMin", label: "Watch Time (min)", compact: true },
    { key: "avgViewDurSec", label: "Avg View Duration", format: "duration" },
    { key: "returningViewers", label: "Returning Viewers" },
    { key: "likes", label: "Likes" },
    { key: "comments", label: "Comments" },
    { key: "shares", label: "Shares" },
    { key: "engagement", label: "Engagement" },
  ],
};

const SUM_KEYS: MetricKey[] = ["followers", "newFollowers", "impressions", "reach", "engagement", "likes", "comments", "shares", "clicks", "saves", "profileVisits", "videoViews", "watchTimeMin", "returningViewers", "postCount"];

/** Aggregate one metric across the page rows (nulls skipped). */
function aggregateMetric(platform: Platform, rows: ComparedRow[], key: MetricKey): number | null {
  if (key === "engagementRate") {
    return engagementRateFor(platform, {
      engagement: totalFor(rows, "engagement").value,
      impressions: totalFor(rows, "impressions").value,
      reach: totalFor(rows, "reach").value,
    });
  }
  if (key === "ctr") return ratioPct(totalFor(rows, "clicks").value, totalFor(rows, "impressions").value);
  if (key === "avgViewDurSec") return weightedAvg(rows, "avgViewDurSec", "videoViews");
  if (key === "growthPct") return null;
  return SUM_KEYS.includes(key) ? totalFor(rows, key as keyof ComparedRow & string).value : null;
}

export function PlatformAnalytics({
  platform,
  title,
  subtitle,
  extraMetrics,
}: {
  platform: Platform;
  title: string;
  subtitle: string;
  extraMetrics: "facebook" | "instagram" | "youtube";
}) {
  const user = useAuth();
  const { data, loading, error, retry } = useRangeFetch<PlatformPayload>("/api/platform", { platform });

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "No data"} onRetry={retry} />;

  const { rows, previousRows } = data;
  if (!rows.length) {
    return (
      <EmptyState
        title={`No ${platformLabel(platform)} channels yet`}
        body={`Connect a ${platformLabel(platform)} account to see ${title.toLowerCase()} here.`}
        action={user?.role === "ADMIN" ? { label: `Connect ${platformLabel(platform)}`, href: "/sync" } : undefined}
      />
    );
  }

  const needsReconnect = rows.filter((r) => r.connectionStatus === "NEEDS_RECONNECT");
  const catalog = PLATFORM_METRICS[platform as Exclude<Platform, "WEBSITE">];

  const columns: Column<ComparedRow>[] = [
    { key: "name", header: "Page", sortable: true, sortValue: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "followers", header: "Followers", align: "right", sortable: true, sortValue: (r) => r.followers, render: (r) => formatMetric(r.followers) },
    { key: "new", header: "New", align: "right", sortable: true, sortValue: (r) => r.newFollowers, render: (r) => formatMetric(r.newFollowers, "signed") },
    ...(isMetricProvided(platform, "reach") ? [{ key: "reach", header: "Reach", align: "right" as const, sortable: true, sortValue: (r: ComparedRow) => r.reach, render: (r: ComparedRow) => formatMetric(r.reach, "number", true) }] : []),
    ...(isMetricProvided(platform, "impressions") ? [{ key: "imp", header: "Views", align: "right" as const, sortable: true, sortValue: (r: ComparedRow) => r.impressions, render: (r: ComparedRow) => formatMetric(r.impressions, "number", true) }] : []),
    ...(isMetricProvided(platform, "videoViews") ? [{ key: "vv", header: "Views", align: "right" as const, sortable: true, sortValue: (r: ComparedRow) => r.videoViews, render: (r: ComparedRow) => formatMetric(r.videoViews, "number", true) }] : []),
    { key: "eng", header: "Engagement", align: "right", sortable: true, sortValue: (r) => r.engagement, render: (r) => formatMetric(r.engagement, "number", true) },
    { key: "er", header: "Eng. rate", align: "right", sortable: true, sortValue: (r) => r.engagementRate, render: (r) => formatMetric(r.engagementRate, "percent") },
    { key: "growth", header: "Growth %", align: "right", sortable: true, sortValue: (r) => r.growthPct, render: (r) => formatMetric(r.growthPct, "percent") },
    { key: "last", header: "Last data", render: (r) => <span className="text-muted">{r.lastDataDay ?? "—"}</span> },
  ];

  const reels = data.posts.filter((p) => p.postType === "reel");
  const topByEngagement = [...data.posts].filter((p) => p.engagement !== null).sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0)).slice(0, 8);
  const topByViews = [...data.posts].filter((p) => p.views !== null).sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 8);

  return (
    <div className="space-y-6">
      <p className="sr-only">{title} — {subtitle}</p>
      {needsReconnect.length ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-warn">
          <span className="min-w-0 flex-1">
            {needsReconnect.map((r) => r.name).join(", ")} needs to be reconnected, so recent data may be missing.
          </span>
          <Link href="/sync" className="rounded-md border border-warn/50 px-3 py-1.5 font-medium hover:bg-warn/10">Reconnect</Link>
        </div>
      ) : null}

      <section aria-label={`${title} key metrics`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS[extraMetrics].map((c) => {
          const value = aggregateMetric(platform, rows, c.key);
          const provided = isMetricProvided(platform, c.key);
          const delta = previousRows ? deltaPct(value, aggregateMetric(platform, previousRows, c.key)) : undefined;
          return (
            <MetricCard
              key={c.key}
              label={c.label}
              value={provided ? value : null}
              format={c.format}
              compact={c.compact}
              delta={provided ? delta : undefined}
              reason={provided ? "no_data" : "not_provided"}
              platformLabel={platformLabel(platform)}
              info={`${catalog.provides[c.key] ? `Source: ${catalog.provides[c.key]}. ` : ""}${FORMULAS[c.key] ?? ""}`.trim() || undefined}
            />
          );
        })}
      </section>

      <SectionCard title="Page comparison" subtitle={subtitle}>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.channelId} caption={`${platformLabel(platform)} pages`} />
      </SectionCard>

      {data.postsLocked ? (
        <EmptyState title="Post analytics are part of the Starter plan" body="Upgrade to see top posts and Reels for this channel." action={{ label: "See plans", href: "/billing" }} />
      ) : (
        <>
          {extraMetrics === "instagram" ? (
            <SectionCard title="Reel performance" subtitle="Reels published in this period">
              <PostMiniTable posts={reels} emptyText="No Reels found in this period." />
            </SectionCard>
          ) : null}
          {extraMetrics === "youtube" ? (
            <SectionCard title="Top videos" subtitle="Most viewed videos and Shorts published this period">
              <PostMiniTable posts={topByViews} showViews emptyText="No videos found in this period." />
            </SectionCard>
          ) : (
            <SectionCard title="Top posts" subtitle="Highest engagement this period">
              <PostMiniTable posts={topByEngagement} emptyText="No posts found in this period." />
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}

function PostMiniTable({ posts, showViews, emptyText }: { posts: PostJson[]; showViews?: boolean; emptyText: string }) {
  if (!posts.length) return <EmptyState title={emptyText} body="Posts appear after a fetch finds content published in the selected period." />;
  return (
    <ul className="space-y-3">
      {posts.map((p) => (
        <li key={p.id} className="flex gap-3 rounded-md border border-line p-3">
          <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded bg-sand-100">
            {p.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-navy-900">
              {p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer noopener" className="hover:underline">{p.title}</a> : p.title}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <PlatformBadge platform={p.platform} />
              {p.postType ? <span className="capitalize">{p.postType}</span> : null}
              <span>{p.channelName} · {format(new Date(p.publishedAt), "MMM d, yyyy")}</span>
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted">
              {showViews ? <>{formatMetric(p.views, "number", true)} views · </> : null}
              {formatMetric(p.likes)} likes · {formatMetric(p.comments)} comments · {formatMetric(p.shares)} shares · {formatMetric(p.engagementRate, "percent")} ER
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
