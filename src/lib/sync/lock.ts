import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

const LOCK_ID = "sync";
const LOCK_TTL_MS = 15 * 60_000;

export class SyncBusyError extends Error {
  constructor() {
    super("A fetch is already running. Try again in a few minutes.");
    this.name = "SyncBusyError";
  }
}

/** DB mutex: succeeds only if no unexpired lock exists. Expired locks (crashed runs) are taken over. */
export async function acquireSyncLock(): Promise<string | null> {
  const owner = randomUUID();
  const lockedUntil = new Date(Date.now() + LOCK_TTL_MS);
  try {
    await prisma.syncLock.create({ data: { id: LOCK_ID, lockedUntil, owner } });
    return owner;
  } catch {
    const taken = await prisma.syncLock.updateMany({
      where: { id: LOCK_ID, lockedUntil: { lt: new Date() } },
      data: { lockedUntil, owner },
    });
    return taken.count === 1 ? owner : null;
  }
}

export async function releaseSyncLock(owner: string) {
  await prisma.syncLock.deleteMany({ where: { id: LOCK_ID, owner } });
}
