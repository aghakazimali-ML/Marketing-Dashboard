import { readFile } from "node:fs/promises";
import { SignJWT, importPKCS8 } from "jose";
import { apiJson } from "@/lib/sync/http";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export function parseServiceAccount(raw: string | null | undefined): ServiceAccount | null {
  if (!raw?.trim().startsWith("{")) return null;
  try {
    const j = JSON.parse(raw) as Partial<ServiceAccount> & { type?: string };
    if (j.type === "service_account" && j.client_email && j.private_key) {
      return { client_email: j.client_email, private_key: j.private_key, token_uri: j.token_uri };
    }
  } catch {
    /* not JSON */
  }
  return null;
}

const cache = new Map<string, { token: string; exp: number }>();

/** Mint a short-lived access token from a service account key (cached ~55 min). */
export async function serviceAccountToken(sa: ServiceAccount, scope: string): Promise<string> {
  const cacheKey = `${sa.client_email}:${scope}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;

  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(tokenUri)
    .setIssuedAt()
    .setExpirationTime("55m")
    .sign(key);

  const res = await apiJson<{ access_token: string; expires_in: number }>(
    tokenUri,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    },
    { label: "Google service account", retries: 1 }
  );
  cache.set(cacheKey, { token: res.access_token, exp: Date.now() + res.expires_in * 1000 });
  return res.access_token;
}

/** Service account JSON from GOOGLE_APPLICATION_CREDENTIALS (file path or inline JSON). */
export async function envServiceAccount(): Promise<ServiceAccount | null> {
  const v = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!v) return null;
  if (v.startsWith("{")) return parseServiceAccount(v);
  try {
    return parseServiceAccount(await readFile(v, "utf8"));
  } catch {
    return null;
  }
}
