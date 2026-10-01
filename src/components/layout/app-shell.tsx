"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { FetchAllButton } from "@/components/layout/fetch-all-button";
import { DateRangeProvider } from "@/components/providers/date-range-provider";
import { FetchAllProvider } from "@/components/providers/fetch-all-provider";
import { AuthProvider } from "@/components/providers/auth-provider";

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <DateRangeProvider>
      <FetchAllProvider>
        <AuthProvider>
          <div className="app-stage flex min-h-screen flex-col lg:flex-row">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="glass-header sticky top-0 z-20 backdrop-blur-xl">
                <div className="flex flex-col gap-4 px-6 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h1 className="font-display text-2xl text-navy-900 drop-shadow-sm">
                        {title}
                      </h1>
                      {subtitle ? (
                        <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
                      ) : null}
                    </div>
                    <FetchAllButton />
                  </div>
                  <DateRangePicker />
                </div>
              </header>
              <main className="flex-1 px-6 py-6 max-lg:px-4">{children}</main>
            </div>
          </div>
        </AuthProvider>
      </FetchAllProvider>
    </DateRangeProvider>
  );
}
