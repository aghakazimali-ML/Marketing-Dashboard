import type { Channel } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { logger } from "@/lib/logger";
import { AuthError } from "@/lib/sync/http";
import {
  envServiceAccount,
  parseServiceAccount,
  serviceAccountToken,
} from "@/lib/sync/google-service-account";
import {
  isProviderConfigured,
  providerForPlatform,
  refreshAccessToken,
} from "@/lib/oauth/providers";

const ENV_TOKEN: Record<string, string | undefined> = {
  LINKEDIN: process.env.LINKEDIN_ACCESS_TOKEN,
  FACEBOOK: process.env.META_ACCESS_TOKEN,
  INSTAGRAM: process.env.META_ACCESS_TOKEN,
};

const REFRESH_MARGIN_MS = 5 * 60_000;
const META_EXTEND_MARGIN_MS = 10 * 24 * 3600_000;

export const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/** Resolve plaintext credential from an encrypted DB field or an env fallback. */
export function resolveChannelToken(
  stored: string | null | undefined,
  envFallback?: string | null
): string | null {
  return decryptSecret(stored) || envFallback?.trim() || null;
}

/**
 * Access token for a channel, refreshed first when it is about to expire.
 * Throws AuthError when the stored credentials can no longer be used.
 */
export async function getChannelAccessToken(channel: Channel): Promise<string | null> {
  const stored = decryptSecret(channel.accessToken);
  const env = (process.env as Record<string, string | undefined>);
  const envFallback =
    ENV_TOKEN[channel.platform] ??
    (channel.platform === "WEBSITE" ? env.GA4_ACCESS_TOKEN : undefined) ??
    (channel.platform === "YOUTUBE" ? env.YOUTUBE_ACCESS_TOKEN : undefined);

  // GA4 service account (inline JSON in the channel, or GOOGLE_APPLICATION_CREDENTIALS)
  if (channel.platform === "WEBSITE") {
    const sa = parseServiceAccount(stored) ?? (!stored ? await envServiceAccount() : null);
    if (sa) {
      try {
        return await serviceAccountToken(sa, GA_SCOPE);
      } catch (e) {
        logger.warn("service account token failed", { channelId: channel.id });
        throw new AuthError(
          `Google service account could not be used (${e instanceof Error ? e.message : "error"})`
        );
      }
    }
  }

  const provider = providerForPlatform(channel.platform);
  const expiring =
    channel.tokenExpiresAt &&
    channel.tokenExpiresAt.getTime() - Date.now() <
      (provider === "meta" ? META_EXTEND_MARGIN_MS : REFRESH_MARGIN_MS);

  if (expiring && isProviderConfigured(provider)) {
    const refreshToken = decryptSecret(channel.refreshToken);
    const canRefresh = provider === "meta" ? Boolean(stored) : Boolean(refreshToken);
    if (canRefresh) {
      try {
        const next = await refreshAccessToken(provider, { accessToken: stored, refreshToken });
        await prisma.channel.update({
          where: { id: channel.id },
          data: {
            accessToken: encryptSecret(next.accessToken),
            refreshToken: next.refreshToken ? encryptSecret(next.refreshToken) : channel.refreshToken,
            tokenExpiresAt: next.expiresAt ?? null,
            expiryWarnedAt: null,
          },
        });
        return next.accessToken;
      } catch (e) {
        // Fall through: if the old token is already expired the upstream call will fail
        // with an auth error and mark the channel as needing reconnection.
        logger.warn("token refresh failed", { channelId: channel.id, provider, error: e instanceof Error ? e.message : String(e) });
        if (channel.tokenExpiresAt && channel.tokenExpiresAt.getTime() < Date.now()) {
          throw new AuthError("Access token expired and could not be refreshed");
        }
      }
    }
  }

  if (channel.tokenExpiresAt && channel.tokenExpiresAt.getTime() < Date.now() && !stored?.length) {
    throw new AuthError("Access token expired");
  }
  return stored || envFallback?.trim() || null;
}

/** YouTube accepts an API key for public Data API calls, but analytics needs OAuth. */
export function getYouTubeApiKey(channel: Channel): string | null {
  return resolveChannelToken(channel.apiKey, process.env.YOUTUBE_API_KEY);
}
