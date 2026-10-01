import { prisma } from "@/lib/db";
import { Platform } from "@/generated/prisma/client";
import { startOfDay, endOfDay, subDays } from "date-fns";
import { resolveChannelToken } from "@/lib/sync/credentials";

/**
 * GA4 Data API sync — uses Website channel externalId as property ID
 * and accessToken (or GA4_ACCESS_TOKEN / GA4_PROPERTY_ID from .env).
 */
export async function syncGA4() {
  const channel = await prisma.channel.findFirst({
    where: { platform: Platform.WEBSITE, isActive: true },
  });

  const propertyId =
    channel?.externalId?.trim() || process.env.GA4_PROPERTY_ID?.trim();
  const accessToken = resolveChannelToken(
    channel?.accessToken,
    process.env.GA4_ACCESS_TOKEN
  );
  const canLive = Boolean(propertyId) && Boolean(accessToken);

  if (!canLive) {
    return {
      records: 0,
      message:
        "Skipped: configure the GA4 property ID and access token. No data was written.",
      mode: "unconfigured" as const,
    };
  }

  const end = new Date();
  const start = subDays(end, 6);
  const body = {
    dateRanges: [
      {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      },
    ],
    metrics: [
      { name: "activeUsers" },
      { name: "sessions" },
      { name: "newUsers" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "conversions" },
    ],
  };

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    throw new Error(`GA4 API ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    rows?: { metricValues: { value: string }[] }[];
  };
  const values = json.rows?.[0]?.metricValues ?? [];
  const num = (i: number) => Number(values[i]?.value ?? 0);

  await prisma.websiteSnapshot.create({
    data: {
      syncedAt: new Date(),
      periodStart: startOfDay(start),
      periodEnd: endOfDay(end),
      users: num(0),
      sessions: num(1),
      newUsers: num(2),
      bounceRate: num(3) <= 1 ? num(3) * 100 : num(3),
      avgSessionDurationSec: num(4),
      conversions: num(5),
      goalCompletions: num(5),
    },
  });

  return {
    records: 1,
    message: "Fetched GA4 website snapshot from live Data API.",
    mode: "live" as const,
  };
}
