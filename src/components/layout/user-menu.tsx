"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { KeyRound, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { useSession } from "@/components/providers/auth-provider";
import { useTheme, type Theme } from "@/components/providers/theme-provider";

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function roleLabel(role: string) {
  return role === "ADMIN" ? "Administrator" : "Analyst";
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="group" aria-label="Colour theme" className="flex gap-1">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
          className={clsx(
            "flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs",
            theme === value ? "border-teal-500 bg-teal-500/15 text-teal-600" : "border-line text-muted hover:bg-sand-100"
          )}
        >
          <Icon size={13} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Sidebar footer variant (dark background, desktop). */
export function SidebarUser() {
  const { user, signOut } = useSession();
  if (!user) return null;
  return (
    <div className="hidden border-t border-white/10 px-4 py-4 lg:block">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-teal-400">
          <UserRound size={18} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white" title={user.email}>{user.email}</p>
          <p className="text-xs text-white/60">{roleLabel(user.role)}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Link href="/account" className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/15 px-2 py-1.5 text-xs text-white/80 hover:bg-white/10">
          <KeyRound size={13} aria-hidden="true" /> Account
        </Link>
        <button type="button" onClick={() => void signOut()} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/15 px-2 py-1.5 text-xs text-white/80 hover:bg-white/10">
          <LogOut size={13} aria-hidden="true" /> Sign out
        </button>
      </div>
    </div>
  );
}

/** Header dropdown, shown below the lg breakpoint where the sidebar footer is hidden. */
export function UserMenu() {
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!user) return null;
  return (
    <div ref={ref} className="relative lg:hidden">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-10 items-center justify-center rounded-full border border-line bg-surface text-navy-900"
      >
        <UserRound size={18} aria-hidden="true" />
        <span className="sr-only">Account menu for {user.email}</span>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-64 space-y-3 rounded-lg border border-line bg-surface p-3 shadow-xl">
          <div>
            <p className="truncate text-sm font-medium text-navy-900" title={user.email}>{user.email}</p>
            <p className="text-xs text-muted">{roleLabel(user.role)}</p>
          </div>
          <ThemeSwitch />
          <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sand-100">
            <KeyRound size={15} aria-hidden="true" /> Account & password
          </Link>
          <button role="menuitem" type="button" onClick={() => void signOut()} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sand-100">
            <LogOut size={15} aria-hidden="true" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export { ThemeSwitch };
