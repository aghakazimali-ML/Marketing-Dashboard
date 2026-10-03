import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/authorization";
import { buildAuthUrl, isProviderConfigured, providerForPlatform, type OAuthProviderId } from "@/lib/oauth/providers";
import { createOAuthState, OAUTH_STATE_COOKIE } from "@/lib/oauth/state";

const IDS: OAuthProviderId[] = ["google", "meta", "linkedin"];

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const { provider } = await ctx.params;
  const id = IDS.find((p) => p === provider);
  if (!id) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  if (!isProviderConfigured(id)) {
    return NextResponse.json({ error: `${id} OAuth is not configured on this server. Set its client ID and secret, or paste a token under Advanced.` }, { status: 501 });
  }

  const channelId = req.nextUrl.searchParams.get("channelId") ?? "";
  const channel = /^[a-z0-9]{10,40}$/i.test(channelId) ? await prisma.channel.findUnique({ where: { id: channelId } }) : null;
  if (!channel || providerForPlatform(channel.platform) !== id) {
    return NextResponse.json({ error: "Channel not found for this provider" }, { status: 404 });
  }

  const { nonce, jwt } = await createOAuthState({ channelId: channel.id, provider: id, email: access.session.email });
  const res = NextResponse.redirect(buildAuthUrl(id, channel.platform, nonce));
  res.cookies.set(OAUTH_STATE_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the top-level redirect back from the provider
    path: "/api/oauth",
    maxAge: 600,
  });
  return res;
}
