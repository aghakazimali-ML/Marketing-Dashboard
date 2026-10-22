"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  BarChart3,
  LayoutDashboard,
  Briefcase,
  Trophy,
  Users,
  Camera,
  Video,
  Globe,
  Images,
  FileBarChart,
  RefreshCw,
  ShieldCheck,
  BrainCircuit,
  CreditCard,
  Lock,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useDateRange } from "@/components/providers/date-range-provider";
import { SidebarUser } from "@/components/layout/user-menu";
import { useEntitlements } from "@/components/providers/entitlements-provider";
import type { FeatureKey } from "@/lib/billing/plans";

const NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  feature?: FeatureKey;
  /** Links that should not carry the date range. */
  noRange?: boolean;
}[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/linkedin", label: "LinkedIn", icon: Briefcase },
  { href: "/linkedin/battleboard", label: "Battleboard", icon: Trophy, feature: "battleboard" },
  { href: "/facebook", label: "Facebook", icon: Users },
  { href: "/instagram", label: "Instagram", icon: Camera },
  { href: "/youtube", label: "YouTube", icon: Video },
  { href: "/website", label: "Website", icon: Globe },
  { href: "/insights", label: "AI Insights", icon: BrainCircuit, feature: "aiInsights" },
  { href: "/posts", label: "Posts", icon: Images },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/sync", label: "Pages & Fetch", icon: RefreshCw, noRange: true },
  { href: "/team", label: "Team & Access", icon: ShieldCheck, adminOnly: true, noRange: true },
  { href: "/billing", label: "Plan & Billing", icon: CreditCard, adminOnly: true, noRange: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuth();
  const { search } = useDateRange();
  const { has, plan, brandName } = useEntitlements();

  return (
    <aside className="app-sidebar flex w-64 shrink-0 flex-col max-lg:w-full lg:sticky lg:top-0 lg:h-screen" aria-label="Primary">
      <div className="px-5 pt-6 pb-2 max-lg:px-4 max-lg:py-3">
        <Link href={`/${search}`} className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-600 text-on-accent">
            <BarChart3 size={20} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="min-w-0 truncate text-lg font-semibold tracking-tight text-navy-900">{brandName}</span>
        </Link>
        <p className="mt-4 inline-flex rounded-full bg-accent-tint px-2.5 py-1 text-[11px] font-semibold tracking-wide text-teal-600 uppercase max-lg:hidden">
          {plan.name} plan
        </p>
      </div>
      <nav className="relative flex-1 space-y-0.5 overflow-y-auto px-3 py-4 max-lg:flex max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:space-y-0 max-lg:py-2">
        {NAV.filter((item) => !item.adminOnly || user?.role === "ADMIN").map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : item.href === "/linkedin"
                ? pathname === "/linkedin"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const locked = item.feature ? !has(item.feature) : false;
          return (
            <Link
              key={item.href}
              href={`${item.href}${item.noRange ? "" : search}`}
              aria-current={isActive ? "page" : undefined}
              className={clsx(
                "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                isActive ? "bg-[var(--nav-active-bg)] text-[var(--nav-active-text,#fff)] shadow-sm" : "text-muted hover:bg-[var(--nav-hover)] hover:text-navy-900"
              )}
            >
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
              {item.label}
              {locked ? (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] opacity-70" title="Available on a higher plan">
                  <Lock size={11} aria-hidden="true" />
                  <span className="sr-only">Requires a higher plan</span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <SidebarUser />
    </aside>
  );
}
