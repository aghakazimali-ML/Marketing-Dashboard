import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@/generated/prisma/client";
import { getConnectionStatus, listRecentSyncRuns, runSync } from "@/lib/sync";
import type { ConnectionInfo } from "@/lib/sync/status";
import { requireAdmin } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/authorization";

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  try {
    const [runs, connections] = await Promise.all([
      listRecentSyncRuns(30),
      getConnectionStatus(),
    ]);
    return NextResponse.json({
      runs,
      connections,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/sync GET]", message);
    return NextResponse.json(
      { error: message, runs: [], connections: [] },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  try {
    const body = (await req.json().catch(() => ({}))) as { platform?: string };
    const platform = body.platform
      ? (body.platform.toUpperCase() as Platform)
      : undefined;

    if (platform && !Object.values(Platform).includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    const results = await runSync(platform);
    let connections: ConnectionInfo[];
    try {
      connections = await getConnectionStatus();
    } catch (e) {
      console.error("[api/sync POST] connection status", e);
      connections = [];
    }

    return NextResponse.json({ results, connections });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/sync POST]", message);
    return NextResponse.json({ error: message, results: [] }, { status: 500 });
  }
}
