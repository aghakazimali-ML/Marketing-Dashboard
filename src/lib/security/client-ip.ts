import { isIP } from "node:net";

type HeaderSource = { headers: { get(name: string): string | null } };

/**
 * Client IP for rate limiting and audit logs.
 *
 * Forwarding headers are attacker-controlled unless a trusted proxy sets them, so they are
 * only used when TRUST_PROXY=true. TRUST_PROXY_HOPS (default 1) is the number of trusted
 * proxies in front of the app; the client is that many entries from the RIGHT of
 * X-Forwarded-For (anything further left was supplied by the client and is ignored).
 * Without TRUST_PROXY the app cannot see the socket address in route handlers, so all
 * callers share the "direct" bucket (stricter, never spoofable).
 */
export function clientIp(req: HeaderSource, env: NodeJS.ProcessEnv = process.env): string {
  if (env.TRUST_PROXY !== "true" && env.TRUST_PROXY !== "1") return "direct";
  const hops = Math.max(1, Number(env.TRUST_PROXY_HOPS ?? 1) || 1);
  const xff = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const candidate = xff[xff.length - hops] ?? req.headers.get("x-real-ip")?.trim() ?? "";
  return isIP(candidate) ? candidate : "unknown";
}
