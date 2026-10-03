import type { ChannelSyncContext, ChannelSyncResult } from "@/lib/sync/types";
import { API_VERSIONS } from "@/lib/metrics/catalog";
import { isSafeExternalId } from "@/lib/security/sanitize";
import { addDaysUtc, utcDay } from "@/lib/metrics/dates";
import { apiJson } from "@/lib/sync/http";
import { sumNullable } from "@/lib/metrics/aggregate";
import { upsertChannelDays, upsertPosts, type ChannelDayInput, type PostInput } from "@/lib/sync/store";
import { logger } from "@/lib/logger";

const BASE = "https://api.linkedin.com/rest";
export const LINKEDIN_SOURCE = `linkedin:${API_VERSIONS.LINKEDIN}`;

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": API_VERSIONS.LINKEDIN,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

export function orgUrn(externalId: string) {
  return externalId.startsWith("urn:") ? externalId : `urn:li:organization:${externalId}`;
}

type ShareStats = {
  impressionCount?: number;
  uniqueImpressionsCount?: number;
  clickCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
};

/** LinkedIn's own `engagement` field is a rate; the engagement *count* is the sum of actions. */
export function engagementCount(s: ShareStats): number {
  return (s.likeCount ?? 0) + (s.commentCount ?? 0) + (s.shareCount ?? 0) + (s.clickCount ?? 0);
}

export function dailyShareRows(
  elements: { timeRange?: { start?: number }; totalShareStatistics?: ShareStats }[]
): ChannelDayInput[] {
  const rows: ChannelDayInput[] = [];
  for (const el of elements) {
    const start = el.timeRange?.start;
    const s = el.totalShareStatistics;
    if (start === undefined || !s) continue;
    rows.push({
      date: utcDay(new Date(start)),
      impressions: s.impressionCount ?? null,
      reach: s.uniqueImpressionsCount ?? null,
      clicks: s.clickCount ?? null,
      likes: s.likeCount ?? null,
      comments: s.commentCount ?? null,
      shares: s.shareCount ?? null,
      engagement: engagementCount(s),
    });
  }
  return rows;
}

export async function syncLinkedInChannel(ctx: ChannelSyncContext): Promise<ChannelSyncResult> {
  const { channel, token } = ctx;
  if (!token) throw new Error("missing token");
  if (!channel.externalId || !isSafeExternalId(channel.externalId)) throw new Error("invalid organization ID");

  const urn = orgUrn(channel.externalId);
  const encUrn = encodeURIComponent(urn);
  const notes: string[] = [];
  const byDay = new Map<number, ChannelDayInput>();
  const merge = (row: ChannelDayInput) =>
    byDay.set(row.date.getTime(), { ...(byDay.get(row.date.getTime()) ?? {}), ...row });

  // LinkedIn only keeps ~12 months of share statistics.
  const from = ctx.from > addDaysUtc(ctx.today, -365) ? ctx.from : addDaysUtc(ctx.today, -365);
  const range = `(timeGranularityType:DAY,timeRange:(start:${from.getTime()},end:${addDaysUtc(ctx.today, 1).getTime()}))`;

  const shares = await apiJson<{ elements?: Parameters<typeof dailyShareRows>[0] }>(
    `${BASE}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encUrn}&timeIntervals=${range}`,
    { headers: headers(token) },
    { label: "LinkedIn share statistics", authStatuses: [403] }
  );
  dailyShareRows(shares.elements ?? []).forEach(merge);

  // Daily follower gains (time-bound follower statistics)
  try {
    const gains = await apiJson<{
      elements?: { timeRange?: { start?: number }; followerGains?: { organicFollowerGain?: number; paidFollowerGain?: number } }[];
    }>(
      `${BASE}/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${encUrn}&timeIntervals=${range}`,
      { headers: headers(token) },
      { label: "LinkedIn follower statistics", retries: 1 }
    );
    for (const el of gains.elements ?? []) {
      if (el.timeRange?.start === undefined || !el.followerGains) continue;
      merge({
        date: utcDay(new Date(el.timeRange.start)),
        newFollowers: sumNullable([el.followerGains.organicFollowerGain, el.followerGains.paidFollowerGain]),
      });
    }
  } catch (e) {
    notes.push(e instanceof Error ? e.message : "follower gains unavailable");
  }

  // Total followers today
  try {
    const size = await apiJson<{ firstDegreeSize?: number }>(
      `${BASE}/networkSizes/${encUrn}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
      { headers: headers(token) },
      { label: "LinkedIn follower count", retries: 1 }
    );
    if (typeof size.firstDegreeSize === "number") merge({ date: ctx.today, followers: size.firstDegreeSize });
  } catch (e) {
    notes.push(e instanceof Error ? e.message : "follower count unavailable");
  }

  let records = await upsertChannelDays(channel.id, LINKEDIN_SOURCE, [...byDay.values()]);

  try {
    records += await syncLinkedInPosts(ctx, urn);
  } catch (e) {
    logger.warn("linkedin posts failed", { channelId: channel.id });
    notes.push(e instanceof Error ? e.message : "posts unavailable");
  }
  return { records, notes };
}

type LiPost = {
  id: string;
  commentary?: string;
  publishedAt?: number;
  createdAt?: number;
  lifecycleState?: string;
  content?: { media?: { title?: string } ; article?: { title?: string; thumbnail?: string } };
};

export async function syncLinkedInPosts(ctx: ChannelSyncContext, urn: string): Promise<number> {
  const token = ctx.token as string;
  const res = await apiJson<{ elements?: LiPost[] }>(
    `${BASE}/posts?author=${encodeURIComponent(urn)}&q=author&count=25&sortBy=LAST_MODIFIED`,
    { headers: { ...headers(token), "X-RestLi-Method": "FINDER" } },
    { label: "LinkedIn posts", retries: 1 }
  );
  const posts = (res.elements ?? []).filter((p) => p.lifecycleState !== "DRAFT");
  if (!posts.length) return 0;

  // Per-post statistics, batched; shares and ugcPosts use different parameters.
  const stats = new Map<string, ShareStats>();
  for (const [param, prefix] of [["shares", "urn:li:share:"], ["ugcPosts", "urn:li:ugcPost:"]] as const) {
    const ids = posts.map((p) => p.id).filter((id) => id.startsWith(prefix));
    for (let i = 0; i < ids.length; i += 20) {
      const list = ids.slice(i, i + 20).map((id) => encodeURIComponent(id)).join(",");
      try {
        const r = await apiJson<{
          elements?: { share?: string; ugcPost?: string; totalShareStatistics?: ShareStats }[];
        }>(
          `${BASE}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(urn)}&${param}=List(${list})`,
          { headers: headers(token) },
          { label: "LinkedIn post statistics", retries: 1 }
        );
        for (const el of r.elements ?? []) {
          const key = el.share ?? el.ugcPost;
          if (key && el.totalShareStatistics) stats.set(key, el.totalShareStatistics);
        }
      } catch {
        /* post metrics stay null for this batch */
      }
    }
  }

  const inputs: PostInput[] = posts.map((p) => {
    const s = stats.get(p.id);
    const text = p.commentary ?? "";
    return {
      externalId: p.id,
      title: (text.split("\n")[0] || p.content?.article?.title || "LinkedIn post").slice(0, 140),
      content: text.slice(0, 2000) || null,
      thumbnailUrl: p.content?.article?.thumbnail ?? null,
      permalink: `https://www.linkedin.com/feed/update/${p.id}`,
      publishedAt: new Date(p.publishedAt ?? p.createdAt ?? Date.now()),
      postType: "post",
      metrics: s
        ? {
            likes: s.likeCount ?? null,
            comments: s.commentCount ?? null,
            shares: s.shareCount ?? null,
            impressions: s.impressionCount ?? null,
            reach: s.uniqueImpressionsCount ?? null,
            clicks: s.clickCount ?? null,
            engagementRate:
              s.impressionCount ? Number(((engagementCount(s) / s.impressionCount) * 100).toFixed(2)) : null,
            ctr: s.impressionCount ? Number((((s.clickCount ?? 0) / s.impressionCount) * 100).toFixed(2)) : null,
          }
        : undefined,
    };
  });
  return upsertPosts(ctx.channel.id, "LINKEDIN", ctx.today, inputs);
}
