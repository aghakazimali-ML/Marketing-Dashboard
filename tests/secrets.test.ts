import { afterEach, describe, expect, it } from "vitest";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, needsReencryption } from "@/lib/crypto/secrets";

const ORIGINAL = process.env.SECRETS_ENCRYPTION_KEY;
afterEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = ORIGINAL;
  delete process.env.SECRETS_ENCRYPTION_KEY_PREVIOUS;
});

describe("secrets (SEC-6/7)", () => {
  it("round-trips with a versioned, key-id prefix", () => {
    const enc = encryptSecret("tok-123")!;
    expect(enc).toMatch(/^enc:v2:[0-9a-f]{8}:/);
    expect(decryptSecret(enc)).toBe("tok-123");
    expect(encryptSecret(enc)).toBe(enc);
  });

  it("does not accept plaintext any more", () => {
    expect(decryptSecret("plain-token")).toBeNull();
    expect(needsReencryption("plain-token")).toBe(true);
  });

  it("decrypts legacy v1 values keyed by AUTH_SECRET", () => {
    const key = createHash("sha256").update(process.env.AUTH_SECRET!).digest();
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([c.update("legacy", "utf8"), c.final()]);
    const v1 = `enc:v1:${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
    expect(decryptSecret(v1)).toBe("legacy");
    expect(needsReencryption(v1)).toBe(true);
  });

  it("supports key rotation via SECRETS_ENCRYPTION_KEY_PREVIOUS", () => {
    const old = encryptSecret("rotate-me")!;
    process.env.SECRETS_ENCRYPTION_KEY_PREVIOUS = process.env.SECRETS_ENCRYPTION_KEY;
    process.env.SECRETS_ENCRYPTION_KEY = "a-brand-new-encryption-key-0123456789";
    expect(decryptSecret(old)).toBe("rotate-me");
    expect(needsReencryption(old)).toBe(true);
    const fresh = encryptSecret(decryptSecret(old))!;
    expect(needsReencryption(fresh)).toBe(false);
    expect(decryptSecret(fresh)).toBe("rotate-me");
  });

  it("rejects tampered ciphertext", () => {
    const enc = encryptSecret("abc")!;
    expect(decryptSecret(enc.slice(0, -2) + "xx")).toBeNull();
  });
});
