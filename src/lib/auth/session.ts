import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "dashboard_session";
const SESSION_TTL = "12h";
const TEAM_SESSION_TTL = "1h";

export type SessionRole = "ADMIN" | "ANALYST";
export type DashboardSession = {
  email: string;
  role: SessionRole;
  teamMemberId?: string;
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
  teamMemberId?: string
) {
  return new SignJWT({
    sub: email,
    role,
    ...(teamMemberId ? { teamMemberId } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(teamMemberId ? TEAM_SESSION_TTL : SESSION_TTL)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const rawRole = String(payload.role ?? "ADMIN").toUpperCase();
    if (rawRole !== "ADMIN" && rawRole !== "ANALYST") return null;
    return {
      email: String(payload.sub ?? ""),
      role: rawRole as SessionRole,
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
    maxAge: 60 * 60 * 12,
  });
}
