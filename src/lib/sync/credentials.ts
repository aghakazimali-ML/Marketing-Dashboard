/** Resolve plaintext credential from encrypted DB field or env fallback. */
import { decryptSecret } from "@/lib/crypto/secrets";

export function resolveChannelToken(
  stored: string | null | undefined,
  envFallback?: string | null
): string | null {
  return decryptSecret(stored) || envFallback?.trim() || null;
}
