"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AuthUser = { email: string; role: "ADMIN" | "ANALYST" };

const AuthContext = createContext<AuthUser | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.email && (data.role === "ADMIN" || data.role === "ANALYST")) {
          setUser({ email: data.email, role: data.role });
        }
      })
      .catch(() => setUser(null));
  }, []);

  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}