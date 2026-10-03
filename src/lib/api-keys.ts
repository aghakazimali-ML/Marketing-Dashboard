import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

const PREFIX = "mdk_";

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey() {
  const key = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) };
}

/** Look up an active key from an `Authorization: Bearer mdk_…` header and record its use. */
export async function authenticateApiKey(header: string | null) {
  const key = header?.replace(/^Bearer\s+/i, "").trim();
  if (!key || !key.startsWith(PREFIX) || key.length > 128) return null;
  const row = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(key) } });
  if (!row || row.revokedAt) return null;
  // Throttle writes: record use at most once a minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return row;
}
