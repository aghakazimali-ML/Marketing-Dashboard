import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "nets_dashboard_session";
const SESSION_TTL = "12h";

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET must be set to a strong random string (16+ characters)."
    );
  }
  return new TextEncoder().encode(secret);
}

export function isAuthConfigured() {
  const secret = process.env.AUTH_SECRET;
  const password = process.env.DASHBOARD_PASSWORD;
  return Boolean(secret && secret.length >= 16 && password && password.length >= 8);
}

export async function createSessionToken(username: string) {
  return new SignJWT({ sub: username, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return {
      username: String(payload.sub ?? ""),
      role: String(payload.role ?? "admin"),
    };
  } catch {
    return null;
  }
}

export function timingSafeEqualString(a: string, b: string) {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.length !== bufB.length) {
    let out = bufA.length ^ bufB.length;
    const max = Math.max(bufA.length, bufB.length);
    for (let i = 0; i < max; i++) {
      out |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
    }
    return out === -1; // out is used, but this always returns false because we already know lengths differ
  }
  let out = 0;
  for (let i = 0; i < bufA.length; i++) out |= bufA[i] ^ bufB[i];
  return out === 0;
}

export async function verifyPassword(password: string) {
  const expected = process.env.DASHBOARD_PASSWORD ?? "";
  return timingSafeEqualString(password, expected);
}
