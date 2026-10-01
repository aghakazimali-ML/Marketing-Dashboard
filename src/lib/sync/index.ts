import { Platform, SyncStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { syncLinkedIn } from "@/lib/sync/linkedin";
import { syncMeta } from "@/lib/sync/meta";
import { syncYouTube } from "@/lib/sync/youtube";
import { syncGA4 } from "@/lib/sync/ga4";
import { getConnectionStatus } from "@/lib/sync/status";

export type SyncResult = {
  platform: Platform;
  status: SyncStatus;
  recordsUpserted: number;
  message: string;
  mode: "live" | "unconfigured";
  error?: string;
};

type ConnectorResult = {
  records: number;
  message: string;
  mode: "live" | "unconfigured";
};

export async function runSync(platform?: Platform): Promise<SyncResult[]> {
  const targets: Platform[] = platform
    ? [platform]
    : [
        Platform.LINKEDIN,
        Platform.FACEBOOK,
        Platform.INSTAGRAM,
        Platform.YOUTUBE,
        Platform.WEBSITE,
      ];

  const results: SyncResult[] = [];

  for (const p of targets) {
    const run = await prisma.syncRun.create({
      data: { platform: p, status: SyncStatus.RUNNING },
    });

    try {
      let result: ConnectorResult;

      if (p === Platform.LINKEDIN) {
        result = await syncLinkedIn();
      } else if (p === Platform.FACEBOOK || p === Platform.INSTAGRAM) {
        result = await syncMeta(p);
      } else if (p === Platform.YOUTUBE) {
        result = await syncYouTube();
      } else {
        result = await syncGA4();
      }

      const skipped = result.mode === "unconfigured";

      await prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: skipped ? SyncStatus.SKIPPED : SyncStatus.SUCCESS,
          finishedAt: new Date(),
          recordsUpserted: result.records,
          message: result.message,
        },
      });

      results.push({
        platform: p,
        status: skipped ? SyncStatus.SKIPPED : SyncStatus.SUCCESS,
        recordsUpserted: result.records,
        message: result.message,
        mode: result.mode,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: SyncStatus.FAILED,
          finishedAt: new Date(),
          error,
          message: "Fetch failed",
        },
      });
      results.push({
        platform: p,
        status: SyncStatus.FAILED,
        recordsUpserted: 0,
        message: "Fetch failed",
        mode: "live",
        error,
      });
    }
  }

  return results;
}

export async function listRecentSyncRuns(limit = 20) {
  return prisma.syncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

export { getConnectionStatus };
