"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import clsx from "clsx";
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
} from "lucide-react";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/linkedin", label: "LinkedIn", icon: Briefcase },
  { href: "/linkedin/battleboard", label: "Battleboard", icon: Trophy },
  { href: "/facebook", label: "Facebook", icon: Users },
  { href: "/instagram", label: "Instagram", icon: Camera },
  { href: "/youtube", label: "YouTube", icon: Video },
  { href: "/website", label: "Website", icon: Globe },
  { href: "/posts", label: "Posts", icon: Images },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/sync", label: "Pages & Fetch", icon: RefreshCw },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar-glow flex w-64 shrink-0 flex-col text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <Link href="/" className="block">
          <Image
            src="/nets-logo.png"
            alt="NETS — Empowering The Future"
            width={160}
            height={64}
            priority
            className="h-auto w-full max-w-[160px]"
          />
        </Link>
        <p className="mt-3 text-[11px] font-semibold tracking-[0.12em] text-teal-400 uppercase">
          Marketing Performance
        </p>
        <p className="mt-0.5 text-xs text-white/55">Internal dashboard</p>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV.map((item) => {
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
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
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
      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-xs text-white/40">Marketing Department · v1</p>
        <p className="mt-2 text-[10px] leading-relaxed text-white/35">
          Design and Developed by{" "}
          <span className="text-teal-400/90">Agha Kazim Ali</span>
        </p>
      </div>
    </aside>
  );
}
