import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { runSync, SyncBusyError } from "@/lib/sync";
import { acquireSyncLock, releaseSyncLock } from "@/lib/sync/lock";
import { encryptSecret } from "@/lib/crypto/secrets";

beforeEach(async () => {
  await prisma.syncLock.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.channel.deleteMany();
  delete process.env.RESEND_API_KEY;
});
afterEach(() => vi.unstubAllGlobals());

describe("sync lock (2.3)", () => {
  it("refuses a second concurrent run and frees after release", async () => {
    const a = await acquireSyncLock();
    expect(a).toBeTruthy();
    expect(await acquireSyncLock()).toBeNull();
    await expect(runSync()).rejects.toBeInstanceOf(SyncBusyError);
    await releaseSyncLock(a as string);
    expect(await acquireSyncLock()).toBeTruthy();
  });

  it("takes over an expired lock left by a crashed run", async () => {
    await prisma.syncLock.create({ data: { id: "sync", lockedUntil: new Date(Date.now() - 1000), owner: "dead" } });
    expect(await acquireSyncLock()).toBeTruthy();
  });
});

describe("runSync", () => {
  it("marks a channel NEEDS_RECONNECT on an auth error and keeps summaries short", async () => {
    const ch = await prisma.channel.create({
      data: { platform: "LINKEDIN", name: "Acme", externalId: "123", accessToken: encryptSecret("expired-token") },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"message":"secret upstream detail"}', { status: 401 })));
    const [li] = await runSync("LINKEDIN" as never, { trigger: "manual" });
    expect(li.status).toBe("FAILED");
    const after = await prisma.channel.findUnique({ where: { id: ch.id } });
    expect(after?.connectionStatus).toBe("NEEDS_RECONNECT");
    expect(after?.lastError).not.toContain("secret upstream detail");
    const run = await prisma.syncRun.findFirst();
    expect(run?.error).not.toContain("secret upstream detail");
  });

  it("skips unconfigured channels without writing data", async () => {
    await prisma.channel.create({ data: { platform: "INSTAGRAM", name: "IG" } });
    const [r] = await runSync("INSTAGRAM" as never);
    expect(r.status).toBe("SKIPPED");
    expect(await prisma.channelDailyMetric.count()).toBe(0);
  });

  it("a successful fetch clears the reconnect flag and records lastSuccessAt", async () => {
    const ch = await prisma.channel.create({
      data: { platform: "WEBSITE", name: "site", externalId: "999", accessToken: encryptSecret("good"), connectionStatus: "NEEDS_RECONNECT" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ dimensionHeaders: [{ name: "date" }], metricHeaders: [{ name: "sessions" }], rows: [] }), { status: 200 }))
    );
    const [r] = await runSync("WEBSITE" as never);
    expect(r.status).toBe("SUCCESS");
    const after = await prisma.channel.findUnique({ where: { id: ch.id } });
    expect(after?.connectionStatus).toBe("ACTIVE");
    expect(after?.lastSuccessAt).not.toBeNull();
  });
});
