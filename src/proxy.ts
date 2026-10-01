import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/invites",
  "/api/auth/setup",
  "/api/health",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
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

  const secret = process.env.AUTH_SECRET;

  // Fail closed in production if auth not configured
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret.length < 16) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            error: "Server misconfigured: set AUTH_SECRET (16+) before deploying.",
          },
          { status: 503 }
        );
      }
      return new NextResponse(
        "Dashboard not configured for production. Set AUTH_SECRET.",
        { status: 503 }
      );
    }
  }

  // Dev without a session secret: allow access locally.
  if (!secret || secret.length < 16) {
    return NextResponse.next();
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
