import { Platform, type Channel } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto/secrets";
import { envServiceAccount, parseServiceAccount } from "@/lib/sync/google-service-account";
import { isProviderConfigured, providerForPlatform } from "@/lib/oauth/providers";

export type ChannelState = "CONNECTED" | "NEEDS_RECONNECT" | "NOT_CONFIGURED";

export type ChannelConnection = {
  id: string;
  name: string;
  state: ChannelState;
  lastSuccessAt: string | null;
  tokenExpiresAt: string | null;
  lastError: string | null;
  authMethod: "oauth" | "manual" | "service_account" | "api_key" | "env" | "none";
};

export type ConnectionInfo = {
  platform: Platform;
  label: string;
  connected: boolean;
  mode: "live" | "unconfigured";
  hint: string;
  envKeys: string[];
  pageCount: number;
  pagesWithCredentials: number;
  needsReconnect: number;
  oauthAvailable: boolean;
  channels: ChannelConnection[];
};

const ENV_FALLBACKS: Record<Platform, string[]> = {
  LINKEDIN: ["LINKEDIN_ACCESS_TOKEN"],
  FACEBOOK: ["META_ACCESS_TOKEN"],
  INSTAGRAM: ["META_ACCESS_TOKEN"],
  YOUTUBE: ["YOUTUBE_API_KEY", "YOUTUBE_ACCESS_TOKEN"],
  WEBSITE: ["GA4_ACCESS_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS"],
};

const LABELS: Record<Platform, string> = {
  LINKEDIN: "LinkedIn",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  WEBSITE: "Website (GA4)",
};

/** Does this channel have a credential the connector can actually use? */
async function describeCredential(ch: Channel): Promise<ChannelConnection["authMethod"]> {
  const token = decryptSecret(ch.accessToken);
  if (ch.platform === "WEBSITE") {
    if (parseServiceAccount(token)) return "service_account";
    if (!token && (await envServiceAccount())) return "service_account";
  }
  if (token) return ch.refreshToken || ch.tokenExpiresAt ? "oauth" : "manual";
  if (ch.platform === "YOUTUBE" && (decryptSecret(ch.apiKey) || process.env.YOUTUBE_API_KEY?.trim())) return "api_key";
  if (ENV_FALLBACKS[ch.platform].some((k) => k !== "GOOGLE_APPLICATION_CREDENTIALS" && process.env[k]?.trim())) return "env";
  return "none";
}

export async function getConnectionStatus(): Promise<ConnectionInfo[]> {
  const channels = await prisma.channel.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const out: ConnectionInfo[] = [];

  for (const platform of Object.values(Platform)) {
    const rows: ChannelConnection[] = [];
    for (const ch of channels.filter((c) => c.platform === platform)) {
      const authMethod = await describeCredential(ch);
      const hasId = Boolean(ch.externalId) || (platform === "WEBSITE" && Boolean(process.env.GA4_PROPERTY_ID?.trim()));
      const state: ChannelState =
        authMethod === "none" || !hasId
          ? "NOT_CONFIGURED"
          : ch.connectionStatus === "NEEDS_RECONNECT"
            ? "NEEDS_RECONNECT"
            : "CONNECTED";
      rows.push({
        id: ch.id,
        name: ch.name,
        state,
        lastSuccessAt: ch.lastSuccessAt?.toISOString() ?? null,
        tokenExpiresAt: ch.tokenExpiresAt?.toISOString() ?? null,
        lastError: ch.lastError,
        authMethod,
      });
    }
    const usable = rows.filter((r) => r.state === "CONNECTED").length;
    const needsReconnect = rows.filter((r) => r.state === "NEEDS_RECONNECT").length;
    out.push({
      platform,
      label: LABELS[platform],
      connected: usable > 0,
      mode: usable > 0 ? "live" : "unconfigured",
      hint:
        usable > 0
          ? `${usable} of ${rows.length} channel(s) ready to fetch.`
          : `Add a page/property ID and credentials (or use Connect) to fetch live data. Unconfigured sources never write data.`,
      envKeys: ENV_FALLBACKS[platform],
      pageCount: rows.length,
      pagesWithCredentials: usable + needsReconnect,
      needsReconnect,
      oauthAvailable: isProviderConfigured(providerForPlatform(platform)),
      channels: rows,
    });
  }
  // Keep the established display order.
  const order: Platform[] = [Platform.LINKEDIN, Platform.FACEBOOK, Platform.INSTAGRAM, Platform.YOUTUBE, Platform.WEBSITE];
  return out.sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform));
}
