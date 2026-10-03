"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { FetchAllButton } from "@/components/layout/fetch-all-button";
import { UserMenu } from "@/components/layout/user-menu";

/**
 * Page chrome only (sidebar, header, range picker). Providers live in the root layout so the
 * date range, session and fetch state persist across navigation.
 */
export function AppShell({
  children,
  title,
  subtitle,
  hideRange,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Hide the date range picker on pages that are not period-based. */
  hideRange?: boolean;
}) {
  return (
    <div className="app-stage flex min-h-screen flex-col lg:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-header sticky top-0 z-20 backdrop-blur-xl">
          <div className="flex flex-col gap-4 px-6 py-4 max-lg:px-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-display text-2xl text-navy-900">{title}</h1>
                  {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
                </div>
                <UserMenu />
              </div>
              <FetchAllButton />
            </div>
            {hideRange ? null : <DateRangePicker />}
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-6 py-6 max-lg:px-4">
          {children}
        </main>
      </div>
    </div>
  );
}
