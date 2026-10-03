import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/authorization";
import { decryptSecret } from "@/lib/crypto/secrets";
import { generateProviderResponse } from "@/lib/ai/providers";
import { rateLimit } from "@/lib/security/rate-limit";
import { resolveRequestRange } from "@/lib/metrics/request";
import { gateFeature } from "@/lib/billing/workspace";
import {
  getChannelMetricsForRange,
  getWebsiteMetrics,
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

  const gate = await gateFeature("aiInsights");
  if (!gate.ok) return gate.response;
  const perDay = gate.workspace.plan.limits.aiInsightsPerDay;
  if (perDay !== null) {
    const day = rateLimit(`ai-daily:${new Date().toISOString().slice(0, 10)}`, perDay, 24 * 60 * 60 * 1000);
    if (!day.ok) {
      return NextResponse.json(
        { error: `Your plan includes ${perDay} AI insight generations per day. Upgrade for more.`, code: "plan_limit" },
        { status: 402 }
      );
    }
  }
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

  const { range } = await resolveRequestRange(Object.fromEntries(req.nextUrl.searchParams));
  const [social, website] = await Promise.all([
    getChannelMetricsForRange(SOCIAL_PLATFORMS, range),
    getWebsiteMetrics(range),
  ]);
  const channels = social
    // Channels with no reported value sort last; nulls are passed on as null ("not provided").
    .sort((left, right) => (right.impressions ?? -1) - (left.impressions ?? -1))
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
      users: website.users,
      sessions: website.sessions,
      conversions: website.conversions,
      bounceRate: website.bounceRate,
      avgSessionDurationSec: website.avgSessionDurationSec,
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