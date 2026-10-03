import { Platform, SyncStatus, type Channel } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { logger, errorFields } from "@/lib/logger";
import { addDaysUtc, utcDay } from "@/lib/metrics/dates";
import { getChannelAccessToken, getYouTubeApiKey } from "@/lib/sync/credentials";
import { ApiError, AuthError } from "@/lib/sync/http";
import { acquireSyncLock, releaseSyncLock, SyncBusyError } from "@/lib/sync/lock";
import { syncLinkedInChannel } from "@/lib/sync/linkedin";
import { syncFacebookChannel, syncInstagramChannel } from "@/lib/sync/meta";
import { syncYouTubeChannel } from "@/lib/sync/youtube";
import { syncGA4Channel } from "@/lib/sync/ga4";
import { getConnectionStatus } from "@/lib/sync/status";
import { sendExpiryWarning, sendReconnectAlert } from "@/lib/email/alerts";
import type { ChannelSyncContext, ChannelSyncResult } from "@/lib/sync/types";

export type ChannelOutcome = {
  channelId: string;
  name: string;
  ok: boolean;
  skipped?: boolean;
  message: string;
};

export type SyncResult = {
  platform: Platform;
  status: SyncStatus;
  recordsUpserted: number;
  message: string;
  mode: "live" | "unconfigured";
  error?: string;
  channels: ChannelOutcome[];
};

export type SyncTrigger = "manual" | "cron" | "cli";

const ALL_PLATFORMS: Platform[] = [
  Platform.LINKEDIN,
  Platform.FACEBOOK,
  Platform.INSTAGRAM,
  Platform.YOUTUBE,
  Platform.WEBSITE,
];

const CONNECTORS: Record<Platform, (ctx: ChannelSyncContext) => Promise<ChannelSyncResult>> = {
  LINKEDIN: syncLinkedInChannel,
  FACEBOOK: syncFacebookChannel,
  INSTAGRAM: syncInstagramChannel,
  YOUTUBE: syncYouTubeChannel,
  WEBSITE: syncGA4Channel,
};

function lookbackFrom(today: Date, hasHistory: boolean) {
  const configured = Number(process.env.SYNC_LOOKBACK_DAYS ?? 35) || 35;
  // The first fetch for a channel backfills further than the daily top-up.
  return addDaysUtc(today, -(hasHistory ? configured : Math.max(configured, 90)));
}

function hasCredentials(ch: Channel, token: string | null) {
  if (!ch.externalId && !(ch.platform === "WEBSITE" && process.env.GA4_PROPERTY_ID)) return false;
  return Boolean(token) || (ch.platform === "YOUTUBE" && Boolean(getYouTubeApiKey(ch)));
}

async function syncOneChannel(ch: Channel, today: Date): Promise<ChannelOutcome & { records: number; detail?: string }> {
  const base = { channelId: ch.id, name: ch.name };
  let token: string | null = null;
  try {
    token = await getChannelAccessToken(ch);
    if (!hasCredentials(ch, token)) {
      return { ...base, ok: false, skipped: true, records: 0, message: "Not configured: add credentials and an account ID" };
    }
    const hasHistory =
      ch.platform === "WEBSITE"
        ? (await prisma.websiteDailyMetric.count({ where: { propertyChannelId: ch.id } })) > 0
        : (await prisma.channelDailyMetric.count({ where: { channelId: ch.id } })) > 0;
    const result = await CONNECTORS[ch.platform]({ channel: ch, token, today, from: lookbackFrom(today, hasHistory) });

    await prisma.channel.update({
      where: { id: ch.id },
      data: { connectionStatus: "ACTIVE", lastSuccessAt: new Date(), lastError: null },
    });
    return {
      ...base,
      ok: true,
      records: result.records,
      message: `${result.records} record(s)${result.notes.length ? ` · ${result.notes.slice(0, 3).join("; ")}` : ""}`,
      detail: result.notes.join("; ") || undefined,
    };
  } catch (e) {
    const summary = e instanceof ApiError || e instanceof AuthError ? e.message : `${ch.name}: fetch failed`;
    const detail = e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);
    logger.error("channel sync failed", { channelId: ch.id, platform: ch.platform, ...errorFields(e) });
    if (e instanceof AuthError) {
      const wasActive = ch.connectionStatus === "ACTIVE";
      await prisma.channel.update({
        where: { id: ch.id },
        data: { connectionStatus: "NEEDS_RECONNECT", lastError: summary.slice(0, 300) },
      });
      if (wasActive) void sendReconnectAlert(ch.name, ch.platform).catch(() => undefined);
    } else {
      await prisma.channel.update({ where: { id: ch.id }, data: { lastError: summary.slice(0, 300) } });
    }
    return { ...base, ok: false, records: 0, message: summary, detail };
  }
}

/** Email admins once when a token with a known expiry is within 7 days of expiring. */
export async function warnExpiringTokens(now = new Date()) {
  const soon = new Date(now.getTime() + 7 * 24 * 3600_000);
  const channels = await prisma.channel.findMany({
    where: { isActive: true, tokenExpiresAt: { not: null, lte: soon, gt: now }, expiryWarnedAt: null },
  });
  for (const ch of channels) {
    await sendExpiryWarning(ch.name, ch.platform, ch.tokenExpiresAt as Date);
    await prisma.channel.update({ where: { id: ch.id }, data: { expiryWarnedAt: now } });
  }
  return channels.length;
}

export async function runSync(
  platform?: Platform,
  opts: { trigger?: SyncTrigger; channelId?: string } = {}
): Promise<SyncResult[]> {
  const owner = await acquireSyncLock();
  if (!owner) throw new SyncBusyError();
  try {
    const today = utcDay(new Date());
    const targets = platform ? [platform] : ALL_PLATFORMS;
    const results: SyncResult[] = [];

    for (const p of targets) {
      const run = await prisma.syncRun.create({
        data: { platform: p, status: SyncStatus.RUNNING, trigger: opts.trigger ?? "manual" },
      });
      const channels = await prisma.channel.findMany({
        where: { platform: p, isActive: true, ...(opts.channelId ? { id: opts.channelId } : {}) },
        orderBy: { name: "asc" },
      });

      const outcomes: (ChannelOutcome & { records: number; detail?: string })[] = [];
      for (const ch of channels) outcomes.push(await syncOneChannel(ch, today));

      const live = outcomes.filter((o) => !o.skipped);
      const okCount = live.filter((o) => o.ok).length;
      const failed = live.filter((o) => !o.ok);
      const records = outcomes.reduce((s, o) => s + o.records, 0);

      let status: SyncStatus;
      let message: string;
      if (!channels.length) {
        status = SyncStatus.SKIPPED;
        message = `Skipped: no ${p} channels are configured. No data was written.`;
      } else if (!live.length) {
        status = SyncStatus.SKIPPED;
        message = "Skipped: configure credentials and an account ID. No data was written.";
      } else if (okCount === 0) {
        status = SyncStatus.FAILED;
        message = "Fetch failed";
      } else {
        status = SyncStatus.SUCCESS;
        message = `Fetched ${okCount} of ${live.length} channel(s)${failed.length ? ` (${failed.length} failed)` : ""}.`;
      }
      const error = failed.length ? failed.map((f) => f.message).join("; ").slice(0, 500) : undefined;
      const detail = outcomes.map((o) => o.detail).filter(Boolean).join("\n").slice(0, 4000) || undefined;

      await prisma.syncRun.update({
        where: { id: run.id },
        data: { status, finishedAt: new Date(), recordsUpserted: records, message, error, detail },
      });
      results.push({
        platform: p,
        status,
        recordsUpserted: records,
        message,
        mode: status === SyncStatus.SKIPPED ? "unconfigured" : "live",
        error,
        channels: outcomes.map(({ channelId, name, ok, skipped, message: m }) => ({ channelId, name, ok, skipped, message: m })),
      });
    }
    await warnExpiringTokens().catch((e) => logger.warn("expiry warnings failed", errorFields(e)));
    return results;
  } finally {
    await releaseSyncLock(owner);
  }
}

export async function listRecentSyncRuns(limit = 20, includeDetail = false) {
  const runs = await prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
  return includeDetail ? runs : runs.map(({ detail, ...rest }) => (void detail, rest));
}

export async function lastSuccessfulSync() {
  return prisma.syncRun.findFirst({
    where: { status: SyncStatus.SUCCESS },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true, platform: true },
  });
}

export { getConnectionStatus, SyncBusyError };
