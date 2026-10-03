import { prisma } from "@/lib/db";
import type { Platform } from "@/generated/prisma/client";

/** `undefined` = not fetched (keep stored value); `null` = platform has no value. */
export type ChannelDayInput = {
  date: Date;
  followers?: number | null;
  newFollowers?: number | null;
  impressions?: number | null;
  reach?: number | null;
  engagement?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  clicks?: number | null;
  saves?: number | null;
  profileVisits?: number | null;
  videoViews?: number | null;
  watchTimeMin?: number | null;
  avgViewDurSec?: number | null;
  returningViewers?: number | null;
};

function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Idempotent: one row per (channel, day). Re-fetching overwrites, never adds. */
export async function upsertChannelDays(
  channelId: string,
  source: string,
  days: ChannelDayInput[]
): Promise<number> {
  if (!days.length) return 0;
  await prisma.$transaction(
    days.map((day) => {
      const { date, ...metrics } = day;
      const data = defined(metrics);
      return prisma.channelDailyMetric.upsert({
        where: { channelId_date: { channelId, date } },
        create: { channelId, date, source, ...data },
        update: { source, fetchedAt: new Date(), ...data },
      });
    })
  );
  return days.length;
}

export type WebsiteDayInput = {
  date: Date;
  users?: number | null;
  sessions?: number | null;
  newUsers?: number | null;
  bounceRate?: number | null;
  avgSessionDurationSec?: number | null;
  conversions?: number | null;
};

export async function upsertWebsiteDays(
  propertyChannelId: string,
  source: string,
  days: WebsiteDayInput[]
): Promise<number> {
  if (!days.length) return 0;
  await prisma.$transaction(
    days.map((day) => {
      const { date, ...metrics } = day;
      const data = defined(metrics);
      return prisma.websiteDailyMetric.upsert({
        where: { propertyChannelId_date: { propertyChannelId, date } },
        create: { propertyChannelId, date, source, ...data },
        update: { source, fetchedAt: new Date(), ...data },
      });
    })
  );
  return days.length;
}

export type BreakdownInput = {
  date: Date;
  kind: "SOURCE" | "LANDING_PAGE";
  key: string;
  users?: number | null;
  sessions?: number | null;
  bounceRate?: number | null;
};

export async function upsertBreakdowns(channelId: string, rows: BreakdownInput[]): Promise<number> {
  if (!rows.length) return 0;
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.$transaction(
      rows.slice(i, i + CHUNK).map(({ date, kind, key, ...metrics }) =>
        prisma.websiteBreakdown.upsert({
          where: { channelId_date_kind_key: { channelId, date, kind, key: key.slice(0, 512) } },
          create: { channelId, date, kind, key: key.slice(0, 512), ...defined(metrics) },
          update: { fetchedAt: new Date(), ...defined(metrics) },
        })
      )
    );
  }
  return rows.length;
}

export type PostInput = {
  externalId: string;
  title?: string | null;
  content?: string | null;
  thumbnailUrl?: string | null;
  permalink?: string | null;
  publishedAt: Date;
  postType?: string | null;
  metrics?: {
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
    impressions?: number | null;
    reach?: number | null;
    clicks?: number | null;
    saves?: number | null;
    views?: number | null;
    engagementRate?: number | null;
    ctr?: number | null;
  };
};

/** Upsert posts plus one metrics row per post for `metricsDay`. */
export async function upsertPosts(
  channelId: string,
  platform: Platform,
  metricsDay: Date,
  posts: PostInput[]
): Promise<number> {
  for (const p of posts) {
    const { metrics, externalId, ...fields } = p;
    const post = await prisma.post.upsert({
      where: { channelId_externalId: { channelId, externalId } },
      create: { channelId, platform, externalId, ...fields },
      update: defined(fields),
      select: { id: true },
    });
    if (metrics) {
      const data = defined(metrics);
      await prisma.postMetrics.upsert({
        where: { postId_date: { postId: post.id, date: metricsDay } },
        create: { postId: post.id, date: metricsDay, ...data },
        update: { fetchedAt: new Date(), ...data },
      });
    }
  }
  return posts.length;
}

