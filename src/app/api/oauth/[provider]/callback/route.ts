import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/authorization";
import { encryptSecret } from "@/lib/crypto/secrets";
import { exchangeCode, isProviderConfigured, pageTokenFor, type OAuthProviderId } from "@/lib/oauth/providers";
import { OAUTH_STATE_COOKIE, readOAuthState } from "@/lib/oauth/state";
import { safeEqual } from "@/lib/auth/accounts";
import { audit } from "@/lib/audit";
import { logger, errorFields } from "@/lib/logger";

function back(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/sync", (process.env.APP_BASE_URL ?? req.nextUrl.origin));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/api/oauth", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const { provider } = await ctx.params;
  const id = (["google", "meta", "linkedin"] as const).find((p) => p === provider) as OAuthProviderId | undefined;
  if (!id || !isProviderConfigured(id)) return back(req, { oauth_error: "provider_unavailable" });

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back(req, { oauth_error: "denied" });
  const code = sp.get("code");
  const state = sp.get("state");

  const saved = await readOAuthState(req.cookies.get(OAUTH_STATE_COOKIE)?.value);
  // CSRF protection: the state parameter must match the cookie set when the flow began,
  // and the same admin must be signed in.
  if (!code || !state || !saved || saved.provider !== id || saved.email !== access.session.email || !safeEqual(state, saved.nonce)) {
    return back(req, { oauth_error: "invalid_state" });
  }

  const channel = await prisma.channel.findUnique({ where: { id: saved.channelId } });
  if (!channel) return back(req, { oauth_error: "channel_missing" });

  try {
    const tokens = await exchangeCode(id, code);
    let accessToken = tokens.accessToken;
    let expiresAt = tokens.expiresAt ?? null;
    if (id === "meta" && channel.platform === "FACEBOOK" && channel.externalId) {
      // A Page token derived from a long-lived user token does not expire.
      const pageToken = await pageTokenFor(tokens.accessToken, channel.externalId).catch(() => null);
      if (pageToken) {
        accessToken = pageToken;
        expiresAt = null;
      }
    }
    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        accessToken: encryptSecret(accessToken),
        // Meta keeps the long-lived token in accessToken (re-exchanged before expiry).
        refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        tokenExpiresAt: expiresAt,
        expiryWarnedAt: null,
        connectionStatus: "ACTIVE",
        lastError: null,
      },
    });
    await audit("channel.oauth_connected", { req, actor: access.session, target: `${channel.platform}:${channel.name}` });
    return back(req, { connected: channel.id });
  } catch (e) {
    logger.error("oauth callback failed", { provider: id, ...errorFields(e) });
    return back(req, { oauth_error: "exchange_failed" });
  }
}
