import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "dashboard_session";
/** Short-lived access token; active users are silently refreshed up to the absolute limit. */
const ACCESS_TTL_SEC = 60 * 60;
const ABSOLUTE_TTL_SEC = 12 * 60 * 60;
export const REFRESH_AFTER_SEC = 15 * 60;

export type SessionRole = "ADMIN" | "ANALYST";
export type DashboardSession = {
  email: string;
  role: SessionRole;
  teamMemberId?: string;
  /** Matches owner/member.sessionVersion; a bump revokes all older sessions. */
  sessionVersion: number;
  /** Original sign-in time (seconds) so refreshes cannot extend a session forever. */
  signedInAt: number;
  issuedAt: number;
};

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
  return Boolean(secret && secret.length >= 16);
}

export async function createSessionToken(
  email: string,
  role: SessionRole = "ADMIN",
  teamMemberId?: string,
  opts: { sessionVersion?: number; signedInAt?: number } = {}
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: email,
    role,
    sv: opts.sessionVersion ?? 0,
    sia: opts.signedInAt ?? now,
    ...(teamMemberId ? { teamMemberId } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_SEC)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<DashboardSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    const rawRole = String(payload.role ?? "").toUpperCase();
    if (rawRole !== "ADMIN" && rawRole !== "ANALYST") return null;
    const issuedAt = typeof payload.iat === "number" ? payload.iat : 0;
    const signedInAt = typeof payload.sia === "number" ? payload.sia : issuedAt;
    if (Date.now() / 1000 - signedInAt > ABSOLUTE_TTL_SEC) return null;
    return {
      email: String(payload.sub ?? ""),
      role: rawRole as SessionRole,
      sessionVersion: typeof payload.sv === "number" ? payload.sv : 0,
      signedInAt,
      issuedAt,
      ...(typeof payload.teamMemberId === "string"
        ? { teamMemberId: payload.teamMemberId }
        : {}),
    };
  } catch {
    return null;
  }
}

function derivePassword(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await derivePassword(password, salt);
  return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, encodedSalt, encodedKey, ...extra] = storedHash.split("$");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedKey || extra.length) {
    return false;
  }

  const salt = Buffer.from(encodedSalt, "base64url");
  const expectedKey = Buffer.from(encodedKey, "base64url");
  if (salt.length !== 16 || expectedKey.length !== 64) return false;

  const actualKey = await derivePassword(password, salt);
  return timingSafeEqual(actualKey, expectedKey);
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTE_TTL_SEC,
  });
}
