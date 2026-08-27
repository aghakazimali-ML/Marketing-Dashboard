"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import {
  ErrorState,
  LoadingState,
  useRangeFetch,
} from "@/components/hooks/use-range-fetch";
import { formatNumber } from "@/lib/metrics/periods";
import { format } from "date-fns";
import clsx from "clsx";

type Post = {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  platform: string;
  channelName: string;
  publishedAt: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
  clicks: number;
  engagementRate: number;
  ctr: number;
  views: number;
  engagement: number;
};

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
    <AppShell
      title="Post Performance"
      subtitle="Cross-platform content ranked by the metrics that matter"
    >
      <PostsContent />
    </AppShell>
  );
}

function PostsContent() {
  const [sort, setSort] = useState("engagement");
  const [platform, setPlatform] = useState("");
  const extra: Record<string, string> = { sort };
  if (platform) extra.platform = platform;

  const { data, loading, error } = useRangeFetch<{ posts: Post[] }>(
    "/api/posts",
    extra
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm"
        >
          {PLATFORMS.map((p) => (
            <option key={p.value || "all"} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {data && (
        <SectionCard
          title={`${data.posts.length} posts`}
          subtitle="Thumbnail · platform · engagement breakdown"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-sand-100/80 text-left">
                <tr>
                  {[
                    "Post",
                    "Platform",
                    "Date",
                    "Likes",
                    "Comments",
                    "Shares",
                    "Impressions",
                    "Reach",
                    "ER",
                    "Clicks",
                    "CTR",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-[11px] font-semibold tracking-wide text-muted uppercase whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.posts.map((p) => (
                  <tr key={p.id} className="border-t border-line/80">
                    <td className="px-3 py-3">
                      <div className="flex max-w-xs items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.thumbnailUrl ?? ""}
                          alt=""
                          className="h-12 w-16 rounded object-cover bg-sand-100"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-navy-900">
                            {p.title}
                          </p>
                          <p className="text-xs text-muted">{p.channelName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={clsx(
                          "rounded px-2 py-0.5 text-[11px] font-semibold",
                          p.platform === "LINKEDIN" && "bg-navy-900/10 text-navy-900",
                          p.platform === "FACEBOOK" && "bg-blue-500/10 text-blue-800",
                          p.platform === "INSTAGRAM" && "bg-pink-500/10 text-pink-800",
                          p.platform === "YOUTUBE" && "bg-red-500/10 text-red-800"
                        )}
                      >
                        {p.platform}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted">
                      {format(new Date(p.publishedAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-right">{formatNumber(p.likes)}</td>
                    <td className="px-3 py-3 tabular-nums text-right">{formatNumber(p.comments)}</td>
                    <td className="px-3 py-3 tabular-nums text-right">{formatNumber(p.shares)}</td>
                    <td className="px-3 py-3 tabular-nums text-right">{formatNumber(p.impressions, true)}</td>
                    <td className="px-3 py-3 tabular-nums text-right">{formatNumber(p.reach, true)}</td>
                    <td className="px-3 py-3 tabular-nums text-right">{p.engagementRate.toFixed(1)}%</td>
                    <td className="px-3 py-3 tabular-nums text-right">{formatNumber(p.clicks)}</td>
                    <td className="px-3 py-3 tabular-nums text-right">{p.ctr.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
