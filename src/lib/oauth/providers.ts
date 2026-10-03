import type { Platform } from "@/generated/prisma/client";
import { API_VERSIONS } from "@/lib/metrics/catalog";
import { apiJson } from "@/lib/sync/http";

export type OAuthProviderId = "google" | "meta" | "linkedin";

export type TokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
};

type ProviderConfig = {
  label: string;
  authUrl: string;
  tokenUrl: string;
  scopes: (platform: Platform) => string[];
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  extraAuthParams?: Record<string, string>;
};

export const PROVIDERS: Record<OAuthProviderId, ProviderConfig> = {
  google: {
    label: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: (p) =>
      p === "WEBSITE"
        ? ["https://www.googleapis.com/auth/analytics.readonly"]
        : [
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/yt-analytics.readonly",
          ],
    clientId: () => process.env.GOOGLE_CLIENT_ID?.trim(),
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET?.trim(),
    extraAuthParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  meta: {
    label: "Meta",
    authUrl: `https://www.facebook.com/${API_VERSIONS.META}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${API_VERSIONS.META}/oauth/access_token`,
    scopes: (p) =>
      p === "INSTAGRAM"
        ? ["pages_show_list", "instagram_basic", "instagram_manage_insights", "pages_read_engagement"]
        : ["pages_show_list", "pages_read_engagement", "read_insights"],
    clientId: () => process.env.META_APP_ID?.trim(),
    clientSecret: () => process.env.META_APP_SECRET?.trim(),
  },
  linkedin: {
    label: "LinkedIn",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: () => ["r_organization_social", "r_organization_admin"],
    clientId: () => process.env.LINKEDIN_CLIENT_ID?.trim(),
    clientSecret: () => process.env.LINKEDIN_CLIENT_SECRET?.trim(),
  },
};

export function providerForPlatform(platform: Platform): OAuthProviderId {
  if (platform === "LINKEDIN") return "linkedin";
  if (platform === "FACEBOOK" || platform === "INSTAGRAM") return "meta";
  return "google";
}

export function isProviderConfigured(id: OAuthProviderId) {
  return Boolean(PROVIDERS[id].clientId() && PROVIDERS[id].clientSecret());
}

export function redirectUri(id: OAuthProviderId) {
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/oauth/${id}/callback`;
}

export function buildAuthUrl(id: OAuthProviderId, platform: Platform, state: string) {
  const p = PROVIDERS[id];
  const url = new URL(p.authUrl);
  url.searchParams.set("client_id", p.clientId() ?? "");
  url.searchParams.set("redirect_uri", redirectUri(id));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", p.scopes(platform).join(id === "meta" ? "," : " "));
  url.searchParams.set("state", state);
  for (const [k, v] of Object.entries(p.extraAuthParams ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

type RawToken = { access_token?: string; refresh_token?: string; expires_in?: number };

function toTokenSet(raw: RawToken, fallbackRefresh?: string | null): TokenSet {
  if (!raw.access_token) throw new Error("Token response had no access_token");
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? fallbackRefresh ?? null,
    expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000) : null,
  };
}

async function tokenRequest(id: OAuthProviderId, params: Record<string, string>): Promise<RawToken> {
  const p = PROVIDERS[id];
  const body = new URLSearchParams({
    client_id: p.clientId() ?? "",
    client_secret: p.clientSecret() ?? "",
    ...params,
  });
  // Meta's token endpoint expects GET; Google/LinkedIn expect form POST.
  if (id === "meta") {
    return apiJson<RawToken>(`${p.tokenUrl}?${body.toString()}`, { method: "GET" }, { label: "Meta token", retries: 0 });
  }
  return apiJson<RawToken>(
    p.tokenUrl,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
    { label: `${p.label} token`, retries: 0 }
  );
}

export async function exchangeCode(id: OAuthProviderId, code: string): Promise<TokenSet> {
  const raw = await tokenRequest(id, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(id),
  });
  const tokens = toTokenSet(raw);
  if (id === "meta") {
    // Swap the short-lived user token for a long-lived (~60 day) one.
    return toTokenSet(
      await tokenRequest("meta", { grant_type: "fb_exchange_token", fb_exchange_token: tokens.accessToken })
    );
  }
  return tokens;
}

/** Refresh an access token. Meta has no refresh token: re-exchange the long-lived token instead. */
export async function refreshAccessToken(
  id: OAuthProviderId,
  current: { accessToken?: string | null; refreshToken?: string | null }
): Promise<TokenSet> {
  if (id === "meta") {
    if (!current.accessToken) throw new Error("No token to extend");
    return toTokenSet(
      await tokenRequest("meta", { grant_type: "fb_exchange_token", fb_exchange_token: current.accessToken })
    );
  }
  if (!current.refreshToken) throw new Error("No refresh token stored");
  const raw = await tokenRequest(id, { grant_type: "refresh_token", refresh_token: current.refreshToken });
  return toTokenSet(raw, current.refreshToken);
}

/** For Meta: swap the user token for the matching Page token (never expires). */
export async function pageTokenFor(userToken: string, pageId: string): Promise<string | null> {
  const res = await apiJson<{ data?: { id: string; access_token?: string }[] }>(
    `https://graph.facebook.com/${API_VERSIONS.META}/me/accounts?fields=id,access_token&limit=200`,
    { headers: { Authorization: `Bearer ${userToken}` } },
    { label: "Meta pages", retries: 0 }
  );
  return res.data?.find((p) => p.id === pageId)?.access_token ?? null;
}
