import { Platform } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { resolveChannelToken } from "@/lib/sync/credentials";
import { isSafeExternalId, safeClientError } from "@/lib/security/sanitize";

/**
 * LinkedIn Organization Page analytics sync.
 * Prefer per-channel accessToken; fall back to LINKEDIN_ACCESS_TOKEN in .env.
 */
export async function syncLinkedIn() {
  const channels = await prisma.channel.findMany({
    where: { platform: Platform.LINKEDIN, isActive: true },
  });

  if (!channels.length) {
    return {
      records: 0,
      message: "Skipped: no LinkedIn pages are configured. No data was written.",
      mode: "unconfigured" as const,
    };
  }

  const globalToken = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
  const canLive = channels.some(
      (c) =>
        Boolean(resolveChannelToken(c.accessToken, globalToken)) &&
        Boolean(c.externalId)
    );

  if (!canLive) {
    return {
      records: 0,
      message: "Skipped: configure a LinkedIn token and organization ID. No data was written.",
      mode: "unconfigured" as const,
    };
  }

  let records = 0;
  const errors: string[] = [];

  for (const ch of channels) {
    const token = resolveChannelToken(ch.accessToken, globalToken);
    if (!token || !ch.externalId) {
      errors.push(`${ch.name}: missing token or organization ID`);
      continue;
    }
    if (!isSafeExternalId(ch.externalId)) {
      errors.push(`${ch.name}: invalid organization ID`);
      continue;
    }

    const orgUrn = ch.externalId.startsWith("urn:")
      ? ch.externalId
      : `urn:li:organization:${ch.externalId}`;

    const statsUrl = `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}`;
    const res = await fetch(statsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "LinkedIn-Version": "202401",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    if (!res.ok) {
      errors.push(`${ch.name}: ${safeClientError(res.status)}`);
      continue;
    }

    const json = (await res.json()) as {
      elements?: {
        totalShareStatistics?: {
          impressionCount?: number;
          clickCount?: number;
          engagement?: number;
          likeCount?: number;
          commentCount?: number;
          shareCount?: number;
        };
      }[];
    };

    const stats = json.elements?.[0]?.totalShareStatistics ?? {};
    const impressions = stats.impressionCount ?? 0;
    const clicks = stats.clickCount ?? 0;
    const engagement = Math.round(stats.engagement ?? 0);
    const periodStart = startOfMonth(new Date());
    const periodEnd = endOfMonth(new Date());

    const latest = await prisma.metricSnapshot.findFirst({
      where: { channelId: ch.id },
      orderBy: { periodEnd: "desc" },
    });

    await prisma.metricSnapshot.create({
      data: {
        channelId: ch.id,
        syncedAt: new Date(),
        periodStart,
        periodEnd,
        followers: latest?.followers ?? 0,
        newFollowers: 0,
        impressions,
        reach: Math.round(impressions * 0.75),
        engagement,
        likes: stats.likeCount ?? 0,
        comments: stats.commentCount ?? 0,
        shares: stats.shareCount ?? 0,
        clicks,
        engagementRate:
          impressions > 0
            ? Number(((engagement / impressions) * 100).toFixed(2))
            : 0,
        ctr:
          impressions > 0
            ? Number(((clicks / impressions) * 100).toFixed(2))
            : 0,
      },
    });
    records++;
  }

  if (records === 0 && errors.length) {
    throw new Error(errors.join("; "));
  }

  return {
    records,
    message: `Fetched ${records} LinkedIn page(s) live${
      errors.length ? ` (${errors.length} skipped: ${errors.join("; ")})` : ""
    }.`,
    mode: "live" as const,
  };
}

