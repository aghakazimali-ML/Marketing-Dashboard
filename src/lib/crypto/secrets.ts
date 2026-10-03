import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Format: enc:v2:<kid>:<iv>.<tag>.<ciphertext>   (AES-256-GCM, base64url parts)
 * kid identifies which key encrypted the value so keys can be rotated.
 * Legacy `enc:v1:` values (keyed by AUTH_SECRET) can still be decrypted, never written.
 */
const V2 = "enc:v2:";
const V1 = "enc:v1:";

type KeyEntry = { kid: string; key: Buffer };

function derive(secret: string): KeyEntry {
  const key = createHash("sha256").update(secret).digest();
  return { kid: createHash("sha256").update(key).digest("hex").slice(0, 8), key };
}

function currentKey(): KeyEntry {
  const secret = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 16) {
    throw new Error("SECRETS_ENCRYPTION_KEY (16+ characters, 32+ in production) is required to store credentials");
  }
  return derive(secret);
}

/** Current key first, then SECRETS_ENCRYPTION_KEY_PREVIOUS (comma separated) for rotation. */
function decryptionKeys(): KeyEntry[] {
  const list: KeyEntry[] = [];
  const primary = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (primary && primary.length >= 16) list.push(derive(primary));
  for (const prev of (process.env.SECRETS_ENCRYPTION_KEY_PREVIOUS ?? "").split(",")) {
    if (prev.trim().length >= 16) list.push(derive(prev.trim()));
  }
  return list;
}

/** AUTH_SECRET was the encryption key before SECRETS_ENCRYPTION_KEY existed. */
function legacyKeys(): KeyEntry[] {
  const out: KeyEntry[] = [];
  const auth = process.env.AUTH_SECRET?.trim();
  if (auth && auth.length >= 16) out.push(derive(auth));
  return [...out, ...decryptionKeys()];
}

export function isEncrypted(stored: string | null | undefined) {
  return Boolean(stored && (stored.startsWith(V2) || stored.startsWith(V1)));
}

/** Encrypt a secret for DB storage. Empty/null stays null. Idempotent for current-key values. */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (!plain?.trim()) return null;
  const value = plain.trim();
  const { kid, key } = currentKey();
  if (value.startsWith(`${V2}${kid}:`)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${V2}${kid}:${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function open(parts: string, keys: KeyEntry[]): string | null {
  const [ivB64, tagB64, dataB64] = parts.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return null;
  for (const { key } of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      /* try the next key */
    }
  }
  return null;
}

/** Decrypt a stored value. Plaintext is NOT accepted: run `npm run rotate-secrets` once after upgrading. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith(V2)) {
    const rest = stored.slice(V2.length);
    const sep = rest.indexOf(":");
    if (sep < 0) return null;
    const kid = rest.slice(0, sep);
    const keys = decryptionKeys();
    const match = keys.filter((k) => k.kid === kid);
    return open(rest.slice(sep + 1), match.length ? match : keys);
  }
  if (stored.startsWith(V1)) return open(stored.slice(V1.length), legacyKeys());
  return null;
}

/** True when a value should be rewritten (plaintext, legacy, or encrypted with an old key). */
export function needsReencryption(stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (!stored.startsWith(V2)) return true;
  return !stored.startsWith(`${V2}${currentKey().kid}:`);
}

export function hasSecret(stored: string | null | undefined) {
  return Boolean(stored && stored.trim());
}
