import type { ChannelSyncContext, ChannelSyncResult } from "@/lib/sync/types";
import { API_VERSIONS } from "@/lib/metrics/catalog";
import { isSafeExternalId } from "@/lib/security/sanitize";
import { addDaysUtc, eachDayUtc, utcDay } from "@/lib/metrics/dates";
import { sumNullable } from "@/lib/metrics/aggregate";
import { apiJson, ApiError, AuthError } from "@/lib/sync/http";
import { upsertChannelDays, upsertPosts, type ChannelDayInput, type PostInput } from "@/lib/sync/store";

const GRAPH = `https://graph.facebook.com/${API_VERSIONS.META}`;
export const META_SOURCE = `meta:${API_VERSIONS.META}`;
/** Instagram account insights only go back ~30 days at day granularity. */
const IG_MAX_DAYS = 30;
/** Facebook insights accept at most ~93 days per request. */
const FB_MAX_DAYS = 90;

/** Meta signals invalid/expired tokens with error code 190 (and 102 for sessions). */
export function isMetaAuthBody(body: string): boolean {
  return /"code"\s*:\s*(190|102)\b/.test(body) || /OAuthException/.test(body) && /"code"\s*:\s*10\b/.test(body);
}

async function graph<T>(path: string, token: string, label: string, retries = 2): Promise<T> {
  return apiJson<T>(
    `${GRAPH}${path}`,
    { headers: { Authorization: `Bearer ${token}` } },
    { label, retries, isAuthBody: isMetaAuthBody }
  );
}

type InsightValue = { value: number | Record<string, number>; end_time?: string };
type InsightResponse = {
  data?: { name: string; values?: InsightValue[]; total_value?: { value: number } }[];
};

/** A time-series value's calendar day: `end_time` marks the END of the day-long period. */
export function dayFromEndTime(endTime: string): Date {
  return utcDay(new Date(new Date(endTime).getTime() - 12 * 3600_000));
}

/**
 * Request insight metrics one at a time so a retired/unsupported metric becomes `null`
 * instead of failing the whole fetch. Auth errors still propagate.
 */
async function insightSeries(
  objectId: string,
  token: string,
  metric: string,
  params: string,
  notes: string[]
): Promise<{ day: Date; value: number }[]> {
  try {
    const r = await graph<InsightResponse>(
      `/${objectId}/insights?metric=${metric}&${params}`,
      token,
      `Meta insights ${metric}`,
      1
    );
    const out: { day: Date; value: number }[] = [];
    for (const v of r.data?.[0]?.values ?? []) {
      if (typeof v.value === "number" && v.end_time) out.push({ day: dayFromEndTime(v.end_time), value: v.value });
    }
    return out;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    notes.push(`${metric} unavailable`);
    return [];
  }
}

export async function syncFacebookChannel(ctx: ChannelSyncContext): Promise<ChannelSyncResult> {
  const { channel, token } = ctx;
  if (!token) throw new Error("missing token");
  if (!channel.externalId || !isSafeExternalId(channel.externalId)) throw new Error("invalid page ID");
  const id = channel.externalId;
  const notes: string[] = [];
  const byDay = new Map<number, ChannelDayInput>();
  const put = (day: Date, patch: Partial<ChannelDayInput>) =>
    byDay.set(day.getTime(), { ...(byDay.get(day.getTime()) ?? { date: day }), ...patch });

  const page = await graph<{ followers_count?: number; fan_count?: number }>(
    `/${id}?fields=followers_count,fan_count`,
    token,
    "Facebook page"
  );
  put(ctx.today, { followers: page.followers_count ?? page.fan_count ?? null });

  const from = ctx.from > addDaysUtc(ctx.today, -FB_MAX_DAYS) ? ctx.from : addDaysUtc(ctx.today, -FB_MAX_DAYS);
  const params = `period=day&since=${Math.floor(from.getTime() / 1000)}&until=${Math.floor(addDaysUtc(ctx.today, 1).getTime() / 1000)}`;

  const metrics: [string, keyof ChannelDayInput][] = [
    ["page_media_view", "impressions"],
    ["page_total_media_view_unique", "reach"],
    ["page_post_engagements", "engagement"],
    ["page_daily_follows_unique", "newFollowers"],
  ];
  for (const [metric, field] of metrics) {
    for (const p of await insightSeries(id, token, metric, params, notes)) put(p.day, { [field]: p.value });
  }

  let records = await upsertChannelDays(channel.id, META_SOURCE, [...byDay.values()]);
  try {
    records += await syncFacebookPosts(ctx, id, token, notes);
  } catch (e) {
    if (e instanceof AuthError) throw e;
    notes.push("posts unavailable");
  }
  return { records, notes };
}

async function syncFacebookPosts(ctx: ChannelSyncContext, pageId: string, token: string, notes: string[]) {
  const res = await graph<{
    data?: {
      id: string;
      message?: string;
      created_time: string;
      permalink_url?: string;
      full_picture?: string;
      shares?: { count?: number };
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
    }[];
  }>(
    `/${pageId}/posts?fields=id,message,created_time,permalink_url,full_picture,shares,reactions.limit(0).summary(true),comments.limit(0).summary(true)&limit=25`,
    token,
    "Facebook posts"
  );
  const posts: PostInput[] = [];
  for (const p of res.data ?? []) {
    const ins = await insightSeriesTotals(p.id, token, ["post_media_view", "post_total_media_view_unique", "post_clicks"], notes);
    const likes = p.reactions?.summary?.total_count ?? null;
    const comments = p.comments?.summary?.total_count ?? null;
    const shares = p.shares?.count ?? 0;
    const impressions = ins.post_media_view ?? null;
    const engagement = sumNullable([likes, comments, shares]);
    posts.push({
      externalId: p.id,
      title: (p.message?.split("\n")[0] || "Facebook post").slice(0, 140),
      content: p.message?.slice(0, 2000) ?? null,
      thumbnailUrl: p.full_picture ?? null,
      permalink: p.permalink_url ?? null,
      publishedAt: new Date(p.created_time),
      postType: "post",
      metrics: {
        likes, comments, shares,
        impressions,
        reach: ins.post_total_media_view_unique ?? null,
        clicks: ins.post_clicks ?? null,
        views: impressions,
        engagementRate: impressions && engagement !== null ? Number(((engagement / impressions) * 100).toFixed(2)) : null,
        ctr: impressions && ins.post_clicks != null ? Number(((ins.post_clicks / impressions) * 100).toFixed(2)) : null,
      },
    });
  }
  return upsertPosts(ctx.channel.id, "FACEBOOK", ctx.today, posts);
}

/** Lifetime per-object insight values, tolerant of unsupported metrics. */
async function insightSeriesTotals(objectId: string, token: string, metrics: string[], notes: string[]) {
  const out: Record<string, number | undefined> = {};
  for (const metric of metrics) {
    try {
      const r = await graph<InsightResponse>(`/${objectId}/insights?metric=${metric}`, token, `Meta ${metric}`, 1);
      const first = r.data?.[0];
      const v = first?.total_value?.value ?? first?.values?.[0]?.value;
      if (typeof v === "number") out[metric] = v;
    } catch (e) {
      if (e instanceof AuthError) throw e;
      if (e instanceof ApiError && e.status === 429) throw e;
      if (!notes.includes(`${metric} unavailable`)) notes.push(`${metric} unavailable`);
    }
  }
  return out;
}

const IG_DAY_METRICS = ["views", "reach", "likes", "comments", "shares", "saves", "profile_views", "profile_links_taps"] as const;

export async function syncInstagramChannel(ctx: ChannelSyncContext): Promise<ChannelSyncResult> {
  const { channel, token } = ctx;
  if (!token) throw new Error("missing token");
  if (!channel.externalId || !isSafeExternalId(channel.externalId)) throw new Error("invalid account ID");
  const id = channel.externalId;
  const notes: string[] = [];
  const byDay = new Map<number, ChannelDayInput>();
  const put = (day: Date, patch: Partial<ChannelDayInput>) =>
    byDay.set(day.getTime(), { ...(byDay.get(day.getTime()) ?? { date: day }), ...patch });

  const account = await graph<{ followers_count?: number }>(`/${id}?fields=followers_count,media_count`, token, "Instagram account");
  put(ctx.today, { followers: account.followers_count ?? null });

  const from = ctx.from > addDaysUtc(ctx.today, -IG_MAX_DAYS) ? ctx.from : addDaysUtc(ctx.today, -IG_MAX_DAYS);

  // Daily new followers (time series)
  const fcParams = `period=day&since=${Math.floor(from.getTime() / 1000)}&until=${Math.floor(addDaysUtc(ctx.today, 1).getTime() / 1000)}`;
  for (const p of await insightSeries(id, token, "follower_count", fcParams, notes)) put(p.day, { newFollowers: p.value });

  // One call per day for the total_value metrics (they are not available as a time series).
  for (const day of eachDayUtc(from, ctx.today)) {
    const since = Math.floor(day.getTime() / 1000);
    const q = `period=day&metric_type=total_value&since=${since}&until=${since + 86400}`;
    const values: Partial<Record<(typeof IG_DAY_METRICS)[number], number>> = {};
    try {
      const r = await graph<InsightResponse>(`/${id}/insights?metric=${IG_DAY_METRICS.join(",")}&${q}`, token, "Instagram insights", 1);
      for (const m of r.data ?? []) {
        if (typeof m.total_value?.value === "number") values[m.name as keyof typeof values] = m.total_value.value;
      }
    } catch (e) {
      if (e instanceof AuthError) throw e;
      // One bad metric rejects the whole request: retry them individually.
      for (const metric of IG_DAY_METRICS) {
        try {
          const r = await graph<InsightResponse>(`/${id}/insights?metric=${metric}&${q}`, token, `Instagram ${metric}`, 0);
          const v = r.data?.[0]?.total_value?.value;
          if (typeof v === "number") values[metric] = v;
        } catch (inner) {
          if (inner instanceof AuthError) throw inner;
          const note = `${metric} unavailable`;
          if (!notes.includes(note)) notes.push(note);
        }
      }
    }
    if (!Object.keys(values).length) continue;
    put(day, {
      impressions: values.views ?? null,
      reach: values.reach ?? null,
      likes: values.likes ?? null,
      comments: values.comments ?? null,
      shares: values.shares ?? null,
      saves: values.saves ?? null,
      profileVisits: values.profile_views ?? null,
      clicks: values.profile_links_taps ?? null,
      // Engagement = likes + comments + shares + saves (rate is divided by reach)
      engagement: sumNullable([values.likes, values.comments, values.shares, values.saves]),
    });
  }

  let records = await upsertChannelDays(channel.id, META_SOURCE, [...byDay.values()]);
  try {
    records += await syncInstagramMedia(ctx, id, token, notes);
  } catch (e) {
    if (e instanceof AuthError) throw e;
    notes.push("media unavailable");
  }
  return { records, notes };
}

async function syncInstagramMedia(ctx: ChannelSyncContext, igId: string, token: string, notes: string[]) {
  const res = await graph<{
    data?: {
      id: string;
      caption?: string;
      media_type?: string;
      media_product_type?: string;
      timestamp: string;
      permalink?: string;
      thumbnail_url?: string;
      media_url?: string;
      like_count?: number;
      comments_count?: number;
    }[];
  }>(
    `/${igId}/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count&limit=25`,
    token,
    "Instagram media"
  );
  const posts: PostInput[] = [];
  for (const m of res.data ?? []) {
    const isStory = m.media_product_type === "STORY";
    const ins = await insightSeriesTotals(
      m.id,
      token,
      isStory ? ["reach"] : ["views", "reach", "shares", "saved"],
      notes
    );
    const engagement = sumNullable([m.like_count, m.comments_count, ins.shares, ins.saved]);
    posts.push({
      externalId: m.id,
      title: (m.caption?.split("\n")[0] || `Instagram ${m.media_type?.toLowerCase() ?? "post"}`).slice(0, 140),
      content: m.caption?.slice(0, 2000) ?? null,
      thumbnailUrl: m.thumbnail_url ?? (m.media_type === "IMAGE" ? m.media_url ?? null : null),
      permalink: m.permalink ?? null,
      publishedAt: new Date(m.timestamp),
      postType: m.media_product_type === "REELS" ? "reel" : isStory ? "story" : "post",
      metrics: {
        likes: m.like_count ?? null,
        comments: m.comments_count ?? null,
        shares: ins.shares ?? null,
        saves: ins.saved ?? null,
        reach: ins.reach ?? null,
        impressions: ins.views ?? null,
        views: ins.views ?? null,
        // Instagram: (likes + comments + shares + saves) / reach
        engagementRate: ins.reach && engagement !== null ? Number(((engagement / ins.reach) * 100).toFixed(2)) : null,
      },
    });
  }
  return upsertPosts(ctx.channel.id, "INSTAGRAM", ctx.today, posts);
}
