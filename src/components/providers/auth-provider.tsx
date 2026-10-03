"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export type AuthUser = { email: string; role: "ADMIN" | "ANALYST" };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, signOut: async () => undefined });

const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password"];
const REFRESH_EVERY_MS = 10 * 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(!isPublic);

  useEffect(() => {
    if (isPublic) return;
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.email && (data.role === "ADMIN" || data.role === "ANALYST")) setUser({ email: data.email, role: data.role });
        else setUser(null);
      })
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isPublic, pathname === "/login"]); // eslint-disable-line react-hooks/exhaustive-deps

  // Silent sliding refresh while the tab is in use, so active people are not signed out hourly.
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void fetch("/api/auth/refresh", { method: "POST" }).catch(() => undefined);
    };
    const timer = setInterval(refresh, REFRESH_EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    // Full navigation on purpose: it discards all in-memory client state of the previous session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login?reason=signed_out";
  }, []);

  const value = useMemo(() => ({ user, loading, signOut }), [user, loading, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** The signed-in user, or null while loading / signed out. */
export function useAuth() {
  return useContext(AuthContext).user;
}

export function useSession() {
  return useContext(AuthContext);
}
