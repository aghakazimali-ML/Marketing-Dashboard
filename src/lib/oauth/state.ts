import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const OAUTH_STATE_COOKIE = "oauth_state";

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET is required");
  return new TextEncoder().encode(`oauth-state:${secret}`);
}

export type OAuthState = { nonce: string; channelId: string; provider: string; email: string };

export async function createOAuthState(data: Omit<OAuthState, "nonce">) {
  const nonce = randomBytes(24).toString("base64url");
  const jwt = await new SignJWT({ ...data, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key());
  return { nonce, jwt };
}

export async function readOAuthState(jwt: string | undefined): Promise<OAuthState | null> {
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, key(), { algorithms: ["HS256"] });
    const { nonce, channelId, provider, email } = payload as Record<string, unknown>;
    if ([nonce, channelId, provider, email].every((v) => typeof v === "string")) {
      return { nonce, channelId, provider, email } as OAuthState;
    }
  } catch {
    /* invalid or expired */
  }
  return null;
}
