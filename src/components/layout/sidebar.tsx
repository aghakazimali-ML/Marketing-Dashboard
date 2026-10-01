"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BarChart3 } from "lucide-react";
import { DASHBOARD_NAME } from "@/lib/brand";
import { useAuth } from "@/components/providers/auth-provider";
import {
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
} from "lucide-react";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/linkedin", label: "LinkedIn", icon: Briefcase },
  { href: "/linkedin/battleboard", label: "Battleboard", icon: Trophy },
  { href: "/facebook", label: "Facebook", icon: Users },
  { href: "/instagram", label: "Instagram", icon: Camera },
  { href: "/youtube", label: "YouTube", icon: Video },
  { href: "/website", label: "Website", icon: Globe },
  { href: "/insights", label: "AI Insights", icon: BrainCircuit },
  { href: "/posts", label: "Posts", icon: Images },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/sync", label: "Pages & Fetch", icon: RefreshCw },
  { href: "/team", label: "Team & Access", icon: ShieldCheck, adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuth();

  return (
    <aside className="sidebar-glow flex w-64 shrink-0 flex-col text-white max-lg:w-full">
      <div className="border-b border-white/10 px-5 py-5 max-lg:px-4 max-lg:py-3">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-teal-500/15 text-teal-300">
            <BarChart3 size={22} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 truncate font-display text-base font-semibold text-white">
            {DASHBOARD_NAME}
          </span>
        </Link>
        <p className="mt-3 text-[11px] font-semibold tracking-[0.12em] text-teal-400 uppercase max-lg:hidden">
          Marketing Performance
        </p>
        <p className="mt-0.5 text-xs text-white/55 max-lg:hidden">Internal dashboard</p>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4 max-lg:flex max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:space-y-0 max-lg:py-2">
        {NAV.filter((item) => !item.adminOnly || user?.role === "ADMIN").map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href ||
                (item.href !== "/linkedin" && pathname.startsWith(item.href));
          const linkedinActive =
            item.href === "/linkedin" &&
            pathname.startsWith("/linkedin") &&
            !pathname.includes("battleboard");
          const isActive = item.href === "/linkedin" ? linkedinActive : active;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-3 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-teal-500/20 text-teal-400"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon size={17} strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="hidden border-t border-white/10 px-5 py-4 lg:block">
        <p className="text-xs text-white/40">Marketing workspace</p>
      </div>
    </aside>
  );
}
