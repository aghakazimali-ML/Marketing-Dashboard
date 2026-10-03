import { isIP } from "node:net";
import { clientIp } from "@/lib/security/client-ip";
import { logger } from "@/lib/logger";

/**
 * Visitor country, detected automatically (the user is never asked).
 *  1. Country headers set by a trusted CDN/proxy (only honoured when TRUST_PROXY=true).
 *  2. IP-geolocation API lookup of the client IP (default: ipwho.is, no key needed; configurable).
 * Returns an ISO-3166 alpha-2 code, or null when it cannot be determined (private/local IP, API down).
 */
export type CountryResult = { country: string | null; source: "header" | "api" | "override" | "none" };

const CDN_HEADERS = ["cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country", "x-country-code"];
const CACHE_TTL_MS = 24 * 3600_000;
const cache = new Map<string, { country: string | null; exp: number }>();

type HeaderSource = { headers: { get(name: string): string | null } };

export function normalizeCountry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  // "XX" / "T1" are CDN placeholders for unknown / Tor.
  return /^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1" ? v : null;
}

export function isPublicIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127));
  }
  if (kind === 6) {
    const l = ip.toLowerCase();
    return !(l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80"));
  }
  return false;
}

/** Pull a country code out of the common geo-API response shapes. */
export function parseGeoResponse(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (o.success === false || o.status === "fail" || o.error === true) return null;
  return normalizeCountry(o.country_code ?? o.countryCode ?? o.country_code2 ?? o.country ?? o.countryCodeIso2);
}

export function clearCountryCache() {
  cache.clear();
}

async function lookup(ip: string): Promise<string | null> {
  const hit = cache.get(ip);
  if (hit && hit.exp > Date.now()) return hit.country;

  const template = process.env.GEOIP_URL?.trim() || "https://ipwho.is/{ip}";
  const url = template.replace("{ip}", encodeURIComponent(ip)).replace("{key}", encodeURIComponent(process.env.GEOIP_API_KEY ?? ""));
  let country: string | null = null;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(2500), cache: "no-store" });
    if (res.ok) country = parseGeoResponse(await res.json().catch(() => null));
  } catch (e) {
    logger.warn("geoip lookup failed", { error: e instanceof Error ? e.message : String(e) });
    // Do not cache failures for long: retry soon.
    cache.set(ip, { country: null, exp: Date.now() + 60_000 });
    return null;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(ip, { country, exp: Date.now() + (country ? CACHE_TTL_MS : 5 * 60_000) });
  return country;
}

export async function detectCountry(req: HeaderSource, env: NodeJS.ProcessEnv = process.env): Promise<CountryResult> {
  // Operator test override (never user-controlled).
  const forced = normalizeCountry(env.GEOIP_FORCE_COUNTRY);
  if (forced) return { country: forced, source: "override" };

  const trustProxy = env.TRUST_PROXY === "true" || env.TRUST_PROXY === "1";
  if (trustProxy) {
    for (const h of CDN_HEADERS) {
      const c = normalizeCountry(req.headers.get(h));
      if (c) return { country: c, source: "header" };
    }
  }
  const ip = clientIp(req, env);
  if (!isPublicIp(ip)) return { country: null, source: "none" };
  const country = await lookup(ip);
  return { country, source: country ? "api" : "none" };
}
