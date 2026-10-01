import { Platform } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { startOfDay, endOfDay, subDays } from "date-fns";
import { resolveChannelToken } from "@/lib/sync/credentials";

/**
 * Meta Graph API sync for Facebook Pages and Instagram Business accounts.
 * Prefer per-channel accessToken; fall back to META_ACCESS_TOKEN.
 */
export async function syncMeta(
  platform: typeof Platform.FACEBOOK | typeof Platform.INSTAGRAM
) {
  const channels = await prisma.channel.findMany({
    where: { platform, isActive: true },
  });

  if (!channels.length) {
    return {
      records: 0,
      message: `Skipped: no ${platform} pages are configured. No data was written.`,
      mode: "unconfigured" as const,
    };
  }

  const globalToken = process.env.META_ACCESS_TOKEN?.trim();
  const canLive = channels.some((c) => Boolean(resolveChannelToken(c.accessToken, globalToken)) && c.externalId);

  if (!canLive) {
    return {
      records: 0,
      message: `Skipped: configure a ${platform} access token and account ID. No data was written.`,
      mode: "unconfigured" as const,
    };
  }

  let records = 0;
  const errors: string[] = [];

  for (const ch of channels) {
    const token = resolveChannelToken(ch.accessToken, globalToken);
    if (!token || !ch.externalId) {
      errors.push(`${ch.name}: missing token or page ID`);
      continue;
    }

    try {
      if (platform === Platform.FACEBOOK) {
        const url = `https://graph.facebook.com/v19.0/${ch.externalId}?fields=followers_count,fan_count&access_token=${token}`;
        const postsUrl = `https://graph.facebook.com/v19.0/${ch.externalId}/posts?fields=created_time,shares,comments.summary(true),likes.summary(true),insights.metric(post_impressions)&limit=25&access_token=${token}`;
        const [pageRes, postsRes] = await Promise.all([fetch(url), fetch(postsUrl)]);
        if (!pageRes.ok) {
          errors.push(`${ch.name}: ${pageRes.status}`);
          continue;
        }
        const page = (await pageRes.json()) as {
          followers_count?: number;
          fan_count?: number;
        };
        let impressions = 0;
        let engagement = 0;
        
        if (postsRes.ok) {
          const postsData = await postsRes.json();
          for (const post of postsData.data ?? []) {
            
            // Engagement = likes + comments + shares
            const likes = post.likes?.summary?.total_count || 0;
            const comments = post.comments?.summary?.total_count || 0;
            const shares = post.shares?.count || 0;
            engagement += (likes + comments + shares);
            
            // Impressions from insights
            const insights = post.insights?.data ?? [];
            for (const metric of insights) {
              if (metric.name === "post_impressions") {
                 impressions += (metric.values?.[0]?.value || 0);
              }
            }
          }
        }
        const periodEnd = endOfDay(new Date());
        const periodStart = startOfDay(subDays(periodEnd, 6));
        await prisma.metricSnapshot.create({
          data: {
            channelId: ch.id,
            syncedAt: new Date(),
            periodStart,
            periodEnd,
            followers: page.followers_count ?? page.fan_count ?? 0,
            impressions,
            reach: Math.round(impressions * 0.7),
            engagement,
            engagementRate:
              impressions > 0
                ? Number(((engagement / impressions) * 100).toFixed(2))
                : 0,
          },
        });
        records++;
      } else {
        const url = `https://graph.facebook.com/v19.0/${ch.externalId}?fields=followers_count,media_count&access_token=${token}`;
        const insightsUrl = `https://graph.facebook.com/v19.0/${ch.externalId}/insights?metric=impressions,reach,profile_views&period=day&access_token=${token}`;
        const [pageRes, insightsRes] = await Promise.all([fetch(url), fetch(insightsUrl)]);
        if (!pageRes.ok) {
          errors.push(`${ch.name}: ${pageRes.status}`);
          continue;
        }
        const page = (await pageRes.json()) as { followers_count?: number };
        let impressions = 0;
        let reach = 0;
        let profileVisits = 0;
        if (insightsRes.ok) {
          const insights = (await insightsRes.json()) as {
            data?: { name: string; values: { value: number }[] }[];
          };
          for (const m of insights.data ?? []) {
            const sum = (m.values ?? []).reduce((s, v) => s + (v.value || 0), 0);
            if (m.name === "impressions") impressions = sum;
            if (m.name === "reach") reach = sum;
            if (m.name === "profile_views") profileVisits = sum;
          }
        }
        const periodEnd = endOfDay(new Date());
        const periodStart = startOfDay(subDays(periodEnd, 6));
        await prisma.metricSnapshot.create({
          data: {
            channelId: ch.id,
            syncedAt: new Date(),
            periodStart,
            periodEnd,
            followers: page.followers_count ?? 0,
            impressions,
            reach,
            profileVisits,
            engagementRate:
              impressions > 0
                ? Number(((reach / impressions) * 100).toFixed(2))
                : 0,
          },
        });
        records++;
      }
    } catch (e) {
      errors.push(`${ch.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (records === 0 && errors.length) {
    throw new Error(errors.join("; "));
  }

  return {
    records,
    message: `Fetched ${records} ${platform} page(s) live${
      errors.length ? ` (${errors.length} skipped)` : ""
    }.`,
    mode: "live" as const,
  };
}

