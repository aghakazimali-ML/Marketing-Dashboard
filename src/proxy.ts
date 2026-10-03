import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/paths";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/invites/validate",
  "/api/auth/setup",
  "/api/auth/forgot",
  "/api/auth/reset",
  "/forgot-password",
  "/reset-password",
  "/api/health",
  // Authenticated by their own secret / signature, not the session cookie:
  "/api/cron/sync",
  "/api/cron/reports",
  "/api/billing/webhook",
  "/api/billing/safepay/webhook",
  "/api/billing/safepay/return", // customer redirect from Safepay, authenticated by its signature
  "/api/v1", // API keys
];

/** Machine-to-machine endpoints: no cookie, so no CSRF concern and no Origin header. */
const NO_ORIGIN_CHECK = ["/api/cron/", "/api/billing/webhook", "/api/billing/safepay/webhook", "/api/billing/safepay/return", "/api/v1/"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function buildCsp(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // strict-dynamic lets the nonce'd Next bootstrap load its chunks; no 'unsafe-inline' for scripts.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Tailwind/Recharts use inline style attributes; scripts are what matters for XSS.
    "style-src 'self' 'unsafe-inline'",
    // Post thumbnails come from social CDNs.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Block cross-site state-changing requests that carry cookies (defence in depth beside SameSite=Lax). */
function crossSiteMutation(req: NextRequest): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return false;
  if (NO_ORIGIN_CHECK.some((p) => req.nextUrl.pathname.startsWith(p))) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false; // non-browser clients (curl) have no cookies to abuse
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  const allowed = new Set<string>();
  const host = req.headers.get("host");
  if (host) allowed.add(host);
  if (process.env.TRUST_PROXY === "true") {
    const fwd = req.headers.get("x-forwarded-host");
    if (fwd) allowed.add(fwd.split(",")[0].trim());
  }
  try {
    if (process.env.APP_BASE_URL) allowed.add(new URL(process.env.APP_BASE_URL).host);
  } catch {
    /* ignore malformed APP_BASE_URL */
  }
  return !allowed.has(originHost);
}

function withCsp(req: NextRequest, nonce: string, csp: string) {
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  // Next reads the nonce from the *request* CSP header and applies it to its own scripts.
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static / Next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".jpg")
  ) {
    return NextResponse.next();
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const secret = process.env.AUTH_SECRET;

  // Fail closed in production if auth not configured
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 16)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Server misconfigured: set AUTH_SECRET (16+) before deploying." }, { status: 503 });
    }
    return new NextResponse("Dashboard not configured for production. Set AUTH_SECRET.", { status: 503 });
  }

  if (crossSiteMutation(req)) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }

  // Dev without a session secret: allow access locally.
  if (!secret || secret.length < 16) return withCsp(req, nonce, csp);
  if (isPublic(pathname)) return withCsp(req, nonce, csp);

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("next", safeNextPath(pathname + req.nextUrl.search));
    return NextResponse.redirect(login);
  }

  return withCsp(req, nonce, csp);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
