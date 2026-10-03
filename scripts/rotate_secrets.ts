/**
 * Encrypts any plaintext credentials and re-encrypts values written with legacy or
 * previous keys using the current SECRETS_ENCRYPTION_KEY. Safe to run repeatedly.
 *
 * Rotation: set SECRETS_ENCRYPTION_KEY to the new key, keep the old one in
 * SECRETS_ENCRYPTION_KEY_PREVIOUS, run `npm run rotate-secrets`, then drop the old key.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { decryptSecret, encryptSecret, isEncrypted, needsReencryption } from "../src/lib/crypto/secrets";

function reencrypt(stored: string | null): { next: string | null; changed: boolean; failed: boolean } {
  if (!stored || !needsReencryption(stored)) return { next: stored, changed: false, failed: false };
  const plain = isEncrypted(stored) ? decryptSecret(stored) : stored;
  if (!plain) return { next: stored, changed: false, failed: true };
  return { next: encryptSecret(plain), changed: true, failed: false };
}

async function main() {
  let changed = 0;
  let failed = 0;

  for (const ch of await prisma.channel.findMany()) {
    const data: Record<string, string | null> = {};
    for (const field of ["accessToken", "apiKey", "refreshToken"] as const) {
      const r = reencrypt(ch[field]);
      if (r.failed) failed++;
      if (r.changed) data[field] = r.next;
    }
    if (Object.keys(data).length) {
      await prisma.channel.update({ where: { id: ch.id }, data });
      changed += Object.keys(data).length;
    }
  }

  const ai = await prisma.aiSettings.findUnique({ where: { id: 1 } });
  if (ai?.apiKey) {
    const r = reencrypt(ai.apiKey);
    if (r.failed) failed++;
    if (r.changed) {
      await prisma.aiSettings.update({ where: { id: 1 }, data: { apiKey: r.next } });
      changed++;
    }
  }

  console.log(`rotate-secrets: re-encrypted ${changed} value(s); ${failed} could not be decrypted.`);
  if (failed) {
    console.error("Some values could not be decrypted with the configured keys. Add the old key to SECRETS_ENCRYPTION_KEY_PREVIOUS or re-enter those credentials.");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
