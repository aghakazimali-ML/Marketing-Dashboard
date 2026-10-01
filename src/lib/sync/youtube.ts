import { Platform } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { startOfDay, endOfDay, subDays } from "date-fns";
import { resolveChannelToken } from "@/lib/sync/credentials";

/**
 * YouTube Data API sync — uses channel apiKey/accessToken or YOUTUBE_API_KEY.
 */
export async function syncYouTube() {
  const channel = await prisma.channel.findFirst({
    where: { platform: Platform.YOUTUBE, isActive: true },
  });

  if (!channel) {
    return {
      records: 0,
      message: "Skipped: no YouTube channel is configured. No data was written.",
      mode: "unconfigured" as const,
    };
  }

  const apiKey =
    resolveChannelToken(channel.apiKey, process.env.YOUTUBE_API_KEY) ||
    resolveChannelToken(channel.accessToken, process.env.YOUTUBE_ACCESS_TOKEN);
  const canLive = Boolean(apiKey) && Boolean(channel.externalId);

  if (!canLive) {
    return {
      records: 0,
      message: "Skipped: configure a YouTube API key and channel ID. No data was written.",
      mode: "unconfigured" as const,
    };
  }

  const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channel.externalId}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    items?: {
      statistics?: {
        subscriberCount?: string;
        viewCount?: string;
        videoCount?: string;
      };
    }[];
  };
  const stats = json.items?.[0]?.statistics ?? {};
  const periodEnd = endOfDay(new Date());
  const periodStart = startOfDay(subDays(periodEnd, 6));
  const followers = Number(stats.subscriberCount ?? 0);
  const videoViews = Number(stats.viewCount ?? 0);

  const latest = await prisma.metricSnapshot.findFirst({
    where: { channelId: channel.id },
    orderBy: { periodEnd: "desc" },
  });

  await prisma.metricSnapshot.create({
    data: {
      channelId: channel.id,
      syncedAt: new Date(),
      periodStart,
      periodEnd,
      followers,
      newFollowers: Math.max(0, followers - (latest?.followers ?? followers)),
      videoViews,
      impressions: videoViews,
      postCount: Number(stats.videoCount ?? 0),
    },
  });

  return {
    records: 1,
    message: "Fetched YouTube snapshot from live Data API.",
    mode: "live" as const,
  };
}
