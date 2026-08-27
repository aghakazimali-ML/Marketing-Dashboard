import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function deriveKey() {
  const secret = process.env.AUTH_SECRET ?? process.env.SECRETS_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET (16+) required to encrypt API credentials");
  }
  return createHash("sha256").update(secret).digest();
}

/** Encrypt a secret for DB storage. Empty/null stays null. */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (!plain?.trim()) return null;
  const value = plain.trim();
  if (value.startsWith(PREFIX)) return value; // already encrypted
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/** Decrypt DB value. Supports legacy plaintext for migration. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const raw = stored.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = raw.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(),
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function hasSecret(stored: string | null | undefined) {
  return Boolean(stored && stored.trim());
}
