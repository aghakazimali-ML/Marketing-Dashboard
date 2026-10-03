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
    <aside className="sidebar-glow flex w-64 shrink-0 flex-col text-white max-lg:w-full" aria-label="Primary">
      <div className="border-b border-white/10 px-5 py-5 max-lg:px-4 max-lg:py-3">
        <Link href={`/${search}`} className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-teal-500/15 text-teal-300">
            <BarChart3 size={22} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="min-w-0 truncate font-display text-base font-semibold text-white">{brandName}</span>
        </Link>
        <p className="mt-3 text-[11px] font-semibold tracking-[0.12em] text-teal-400 uppercase max-lg:hidden">
          {plan.name} plan
        </p>
        <p className="mt-0.5 text-xs text-white/60 max-lg:hidden">Marketing performance</p>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4 max-lg:flex max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:space-y-0 max-lg:py-2">
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
                "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-3 py-2.5 text-sm transition-colors",
                isActive ? "bg-teal-500/20 text-teal-400" : "text-white/75 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
              {item.label}
              {locked ? (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-white/60" title="Available on a higher plan">
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
