import type { ChannelSyncContext, ChannelSyncResult } from "@/lib/sync/types";
import { API_VERSIONS } from "@/lib/metrics/catalog";
import { isSafeExternalId } from "@/lib/security/sanitize";
import { dayKey, parseDayString } from "@/lib/metrics/dates";
import { sumNullable } from "@/lib/metrics/aggregate";
import { ApiError, AuthError, apiJson } from "@/lib/sync/http";
import { upsertChannelDays, upsertPosts, type ChannelDayInput, type PostInput } from "@/lib/sync/store";
import { getYouTubeApiKey } from "@/lib/sync/credentials";

const DATA = `https://www.googleapis.com/youtube/${API_VERSIONS.YOUTUBE_DATA}`;
const ANALYTICS = `https://youtubeanalytics.googleapis.com/${API_VERSIONS.YOUTUBE_ANALYTICS}/reports`;
export const YOUTUBE_SOURCE = `youtube:analytics-${API_VERSIONS.YOUTUBE_ANALYTICS}+data-${API_VERSIONS.YOUTUBE_DATA}`;

/** Analytics rows are positional: [day, ...metrics] in the order requested. */
export function analyticsRows(
  json: { columnHeaders?: { name: string }[]; rows?: (string | number)[][] }
): { day: Date; values: Record<string, number> }[] {
  const names = (json.columnHeaders ?? []).map((c) => c.name);
  const out: { day: Date; values: Record<string, number> }[] = [];
  for (const row of json.rows ?? []) {
    const day = parseDayString(String(row[0]));
    if (!day) continue;
    const values: Record<string, number> = {};
    names.forEach((n, i) => {
      if (i > 0 && typeof row[i] === "number") values[n] = row[i] as number;
    });
    out.push({ day, values });
  }
  return out;
}

export function parseIsoDuration(iso: string | undefined): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export async function syncYouTubeChannel(ctx: ChannelSyncContext): Promise<ChannelSyncResult> {
  const { channel, token } = ctx;
  if (!channel.externalId || !isSafeExternalId(channel.externalId)) throw new Error("invalid channel ID");
  const apiKey = getYouTubeApiKey(channel);
  if (!token && !apiKey) throw new Error("missing credentials");

  const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const keyParam = !token && apiKey ? `&key=${encodeURIComponent(apiKey)}` : "";
  const notes: string[] = [];
  const byDay = new Map<number, ChannelDayInput>();
  const put = (day: Date, patch: Partial<ChannelDayInput>) =>
    byDay.set(day.getTime(), { ...(byDay.get(day.getTime()) ?? { date: day }), ...patch });

  const info = await apiJson<{
    items?: {
      statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }[];
  }>(
    `${DATA}/channels?part=statistics,contentDetails&id=${encodeURIComponent(channel.externalId)}${keyParam}`,
    { headers: auth },
    { label: "YouTube channel", authStatuses: [403] }
  );
  const item = info.items?.[0];
  if (!item) throw new Error("YouTube channel not found");
  const subs = item.statistics?.hiddenSubscriberCount ? null : Number(item.statistics?.subscriberCount ?? NaN);
  put(ctx.today, { followers: subs !== null && Number.isFinite(subs) ? subs : null });

  if (token) {
    const q = (metrics: string) =>
      `${ANALYTICS}?ids=channel==${encodeURIComponent(channel.externalId as string)}&startDate=${dayKey(ctx.from)}&endDate=${dayKey(ctx.today)}&dimensions=day&sort=day&metrics=${metrics}`;
    const analytics = async (metrics: string, label: string, tolerant: boolean) => {
      try {
        return analyticsRows(
          await apiJson(q(metrics), { headers: auth }, { label, retries: 1, authStatuses: [403] })
        );
      } catch (e) {
        if (!tolerant || e instanceof AuthError) throw e;
        notes.push(`${label} unavailable`);
        return [];
      }
    };

    for (const r of await analytics(
      "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares",
      "YouTube analytics",
      false
    )) {
      const v = r.values;
      put(r.day, {
        videoViews: v.views ?? null,
        watchTimeMin: v.estimatedMinutesWatched ?? null,
        avgViewDurSec: v.averageViewDuration ?? null,
        newFollowers:
          v.subscribersGained !== undefined ? v.subscribersGained - (v.subscribersLost ?? 0) : null,
        likes: v.likes ?? null,
        comments: v.comments ?? null,
        shares: v.shares ?? null,
        engagement: sumNullable([v.likes, v.comments, v.shares]),
      });
    }
    // Best effort: not every channel/API version exposes returning viewers.
    for (const r of await analytics("returningViewers", "YouTube returning viewers", true)) {
      put(r.day, { returningViewers: r.values.returningViewers ?? null });
    }
  } else {
    notes.push("Connect with Google OAuth to unlock views, watch time and subscriber gains (an API key only returns the subscriber count).");
  }

  let records = await upsertChannelDays(channel.id, YOUTUBE_SOURCE, [...byDay.values()]);
  try {
    const uploads = item.contentDetails?.relatedPlaylists?.uploads;
    if (uploads) records += await syncVideos(ctx, uploads, auth, keyParam);
  } catch (e) {
    if (e instanceof AuthError) throw e;
    if (e instanceof ApiError && e.status === 429) throw e;
    notes.push("videos unavailable");
  }
  return { records, notes };
}

async function syncVideos(ctx: ChannelSyncContext, uploads: string, auth: Record<string, string>, keyParam: string) {
  const list = await apiJson<{ items?: { contentDetails?: { videoId?: string } }[] }>(
    `${DATA}/playlistItems?part=contentDetails&playlistId=${encodeURIComponent(uploads)}&maxResults=25${keyParam}`,
    { headers: auth },
    { label: "YouTube uploads", retries: 1 }
  );
  const ids = (list.items ?? []).map((i) => i.contentDetails?.videoId).filter((v): v is string => Boolean(v));
  if (!ids.length) return 0;

  const vids = await apiJson<{
    items?: {
      id: string;
      snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
    }[];
  }>(
    `${DATA}/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}${keyParam}`,
    { headers: auth },
    { label: "YouTube videos", retries: 1 }
  );

  const num = (v: string | undefined) => (v === undefined ? null : Number(v));
  const posts: PostInput[] = (vids.items ?? []).map((v) => {
    const seconds = parseIsoDuration(v.contentDetails?.duration);
    const tagged = /#shorts/i.test(`${v.snippet?.title ?? ""} ${v.snippet?.description ?? ""}`);
    const views = num(v.statistics?.viewCount);
    const likes = num(v.statistics?.likeCount);
    const comments = num(v.statistics?.commentCount);
    const engagement = sumNullable([likes, comments]);
    return {
      externalId: v.id,
      title: (v.snippet?.title ?? "YouTube video").slice(0, 140),
      content: v.snippet?.description?.slice(0, 2000) ?? null,
      thumbnailUrl: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url ?? null,
      permalink: `https://www.youtube.com/watch?v=${v.id}`,
      publishedAt: new Date(v.snippet?.publishedAt ?? Date.now()),
      // Shorts have no explicit flag in the Data API: #shorts tag or a duration of 60s or less.
      postType: tagged || (seconds !== null && seconds <= 60) ? "short" : "video",
      metrics: {
        views,
        likes,
        comments,
        engagementRate: views && engagement !== null ? Number(((engagement / views) * 100).toFixed(2)) : null,
      },
    };
  });
  return upsertPosts(ctx.channel.id, "YOUTUBE", ctx.today, posts);
}

