import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@/generated/prisma/client";
import { getConnectionStatus, lastSuccessfulSync, listRecentSyncRuns, runSync, SyncBusyError } from "@/lib/sync";
import type { ConnectionInfo } from "@/lib/sync/status";
import { requireAdmin, requireUser } from "@/lib/auth/authorization";
import { audit } from "@/lib/audit";
import { logger, errorFields } from "@/lib/logger";
import { rateLimit } from "@/lib/security/rate-limit";

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  try {
    const [runs, connections, last] = await Promise.all([
      // Analysts see short summaries only; admins also get upstream detail.
      listRecentSyncRuns(30, access.session.role === "ADMIN"),
      getConnectionStatus(),
      lastSuccessfulSync(),
    ]);
    return NextResponse.json({ runs, connections, lastSuccessAt: last?.finishedAt ?? null });
  } catch (e) {
    logger.error("sync GET failed", errorFields(e));
    return NextResponse.json({ error: "Could not load fetch status", runs: [], connections: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const limited = rateLimit(`sync:${access.session.email}`, 10, 60 * 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many fetches. Try again later." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { platform?: string; channelId?: string };
    const platform = body.platform ? (body.platform.toUpperCase() as Platform) : undefined;
    if (platform && !Object.values(Platform).includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }
    const channelId = typeof body.channelId === "string" && /^[a-z0-9]{10,40}$/i.test(body.channelId) ? body.channelId : undefined;

    const results = await runSync(platform, { trigger: "manual", channelId });
    await audit("sync.manual", { req, actor: access.session, target: platform ?? "ALL" });

    let connections: ConnectionInfo[] = [];
    try {
      connections = await getConnectionStatus();
    } catch (e) {
      logger.warn("connection status failed", errorFields(e));
    }
    return NextResponse.json({ results, connections });
  } catch (e) {
    if (e instanceof SyncBusyError) {
      return NextResponse.json({ error: e.message, results: [] }, { status: 409 });
    }
    logger.error("sync POST failed", errorFields(e));
    return NextResponse.json({ error: "The fetch could not be completed.", results: [] }, { status: 500 });
  }
}
