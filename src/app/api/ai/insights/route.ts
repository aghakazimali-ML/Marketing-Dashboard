import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/authorization";
import { decryptSecret } from "@/lib/crypto/secrets";
import { generateProviderResponse } from "@/lib/ai/providers";
import { rateLimit } from "@/lib/security/rate-limit";
import { parseRangeParams } from "@/lib/metrics/params";
import {
  getChannelMetricsForRange,
  getWebsiteMetrics,
  withDeltas,
} from "@/lib/metrics/queries";

const insightSchema = z.object({
  summary: z.string().min(1).max(1000),
  insights: z.array(z.object({
    title: z.string().min(1).max(120),
    observation: z.string().min(1).max(500),
    recommendation: z.string().min(1).max(500),
    priority: z.enum(["high", "medium", "low"]),
  })).min(1).max(6),
});

const SOCIAL_PLATFORMS = [
  Platform.LINKEDIN,
  Platform.FACEBOOK,
  Platform.INSTAGRAM,
  Platform.YOUTUBE,
];

export async function POST(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  const limit = rateLimit(`ai-insights:${access.session.email}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Insight limit reached. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const settings = await prisma.aiSettings.findUnique({ where: { id: 1 } });
  const apiKey = settings?.apiKey ? decryptSecret(settings.apiKey) : null;
  if (!settings || !apiKey) {
    return NextResponse.json(
      { error: "An administrator must configure an AI provider and API key before generating insights." },
      { status: 503 }
    );
  }

  const range = parseRangeParams(Object.fromEntries(req.nextUrl.searchParams));
  const [social, website] = await Promise.all([
    getChannelMetricsForRange(SOCIAL_PLATFORMS, range),
    getWebsiteMetrics(range),
  ]);
  const channels = withDeltas(social.current, social.previous)
    .sort((left, right) => right.impressions - left.impressions)
    .slice(0, 40)
    .map((channel) => ({
      platform: channel.platform,
      name: channel.name,
      followers: channel.followers,
      newFollowers: channel.newFollowers,
      impressions: channel.impressions,
      reach: channel.reach,
      engagement: channel.engagement,
      engagementRate: channel.engagementRate,
      clicks: channel.clicks,
      growthPct: channel.growthPct,
    }));

  const metrics = {
    period: range.label,
    channels,
    website: {
      users: website.current.users,
      sessions: website.current.sessions,
      conversions: website.current.conversions,
      bounceRate: website.current.bounceRate,
      avgSessionDurationSec: website.current.avgSessionDurationSec,
    },
  };

  try {
    const raw = await generateProviderResponse({
      provider: settings.provider,
      model: settings.model,
      apiKey,
      metrics,
    });
    const insights = insightSchema.safeParse(raw);
    if (!insights.success) {
      return NextResponse.json({ error: "The AI provider returned an invalid insight response." }, { status: 502 });
    }

    return NextResponse.json({ ...insights.data, period: range.label, generatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the AI provider. Check the server connection and configured model." },
      { status: 502 }
    );
  }
}