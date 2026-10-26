"use client";

import { Suspense, type ReactNode } from "react";
import { AuthProvider, type AuthUser } from "@/components/providers/auth-provider";
import { ConfirmProvider } from "@/components/providers/confirm-provider";
import { EntitlementsProvider } from "@/components/providers/entitlements-provider";
import { DateRangeProvider } from "@/components/providers/date-range-provider";
import { FetchAllProvider } from "@/components/providers/fetch-all-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

/** Mounted once in the root layout so the date range, fetch state and session survive navigation. */
export function Providers({ children, initialUser = null }: { children: ReactNode; initialUser?: AuthUser | null }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider initialUser={initialUser}>
            <Suspense fallback={null}>
              <DateRangeProvider>
                <EntitlementsProvider>
                  <FetchAllProvider>{children}</FetchAllProvider>
                </EntitlementsProvider>
              </DateRangeProvider>
            </Suspense>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
