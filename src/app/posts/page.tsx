"use client";

import { useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState, TableSkeleton } from "@/components/ui/states";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import { PlatformBadge } from "@/components/ui/platform-badge";
import { ErrorState, useRangeFetch } from "@/components/hooks/use-range-fetch";
import { useEntitlements } from "@/components/providers/entitlements-provider";
import { formatMetric } from "@/lib/metrics/format";
import type { PostRow } from "@/lib/metrics/queries";

type Post = Omit<PostRow, "publishedAt"> & { publishedAt: string };

const SORTS = [
  { value: "views", label: "Most Viewed" },
  { value: "engagement", label: "Most Engaged" },
  { value: "shares", label: "Most Shared" },
  { value: "clicks", label: "Most Clicked" },
  { value: "ctr", label: "Highest CTR" },
];
const PLATFORMS = [
  { value: "", label: "All platforms" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "YOUTUBE", label: "YouTube" },
];

export default function PostsPage() {
  return (
    <AppShell title="Post Performance" subtitle="Cross-platform content ranked by the metrics that matter">
      <PostsGate />
    </AppShell>
  );
}

function PostsGate() {
  const { has } = useEntitlements();
  return has("posts") ? <PostsContent /> : <UpgradePrompt feature="posts" />;
}

function PostsContent() {
  const [sort, setSort] = useState("engagement");
  const [platform, setPlatform] = useState("");
  const extra: Record<string, string> = { sort };
  if (platform) extra.platform = platform;
  const { data, loading, error, retry } = useRangeFetch<{ posts: Post[] }>("/api/posts", extra);

  const select = "rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-muted">
          <span className="mb-1 block font-semibold uppercase tracking-wide">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={select}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          <span className="mb-1 block font-semibold uppercase tracking-wide">Platform</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={select}>
            {PLATFORMS.map((p) => <option key={p.value || "all"} value={p.value}>{p.label}</option>)}
          </select>
        </label>
      </div>

      {loading && !data ? <TableSkeleton rows={6} /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}
      {data ? (
        <SectionCard title={`${data.posts.length} posts`} subtitle="Posts with no value for a metric show “—”, never zero">
          {data.posts.length === 0 ? (
            <EmptyState title="No posts in this period" body="Posts appear after a fetch finds content published in the selected range." action={{ label: "Go to Pages & Fetch", href: "/sync" }} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <caption className="sr-only">Post performance</caption>
                <thead className="table-head text-left">
                  <tr>
                    {["Post", "Platform", "Date", "Likes", "Comments", "Shares", "Impressions", "Reach", "ER", "Clicks", "CTR"].map((h) => (
                      <th key={h} scope="col" className="px-3 py-3 text-[11px] font-semibold tracking-wide text-muted uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.posts.map((p) => (
                    <tr key={p.id} className="border-t border-line/80">
                      <td className="px-3 py-3">
                        <div className="flex max-w-xs items-center gap-3">
                          {p.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-16 rounded bg-sand-100 object-cover" />
                          ) : (
                            <div aria-hidden="true" className="h-12 w-16 rounded bg-sand-100" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-navy-900">
                              {p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer noopener" className="hover:underline">{p.title}</a> : p.title}
                            </p>
                            <p className="text-xs text-muted">{p.channelName}{p.postType ? ` · ${p.postType}` : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><PlatformBadge platform={p.platform} /></td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted">{format(new Date(p.publishedAt), "MMM d, yyyy")}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMetric(p.likes)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMetric(p.comments)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMetric(p.shares)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMetric(p.impressions, "number", true)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMetric(p.reach, "number", true)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMetric(p.engagementRate, "percent")}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMetric(p.clicks)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMetric(p.ctr, "percent")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
