"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { KeyRound, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { useSession } from "@/components/providers/auth-provider";
import { ACCENTS, useTheme, type Theme } from "@/components/providers/theme-provider";

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function roleLabel(role: string) {
  return role === "ADMIN" ? "Administrator" : "Analyst";
}

function ThemeSwitch() {
  const { theme, setTheme, accent, setAccent } = useTheme();
  return (
    <div className="space-y-2">
    <div role="group" aria-label="Accent colour" className="flex gap-1.5">
      {ACCENTS.map((a) => (
        <button
          key={a.value}
          type="button"
          aria-pressed={accent === a.value}
          onClick={() => setAccent(a.value)}
          className={clsx(
            "flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2 py-1.5 text-xs",
            accent === a.value ? "border-teal-500 bg-accent-tint text-ink" : "border-line text-muted hover:bg-sand-100"
          )}
        >
          <span aria-hidden="true" className="size-3 rounded-full" style={{ background: a.swatch }} />
          {a.label}
        </button>
      ))}
    </div>
    <div role="group" aria-label="Colour theme" className="flex gap-1">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
          className={clsx(
            "flex flex-1 items-center justify-center gap-1 rounded-full border px-2 py-1.5 text-xs",
            theme === value ? "border-teal-500 bg-accent-tint text-ink" : "border-line text-muted hover:bg-sand-100"
          )}
        >
          <Icon size={13} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
    </div>
  );
}

/** Sidebar footer: dark promo-style card with the signed-in user and the account actions. */
export function SidebarUser() {
  const { user, signOut } = useSession();
  if (!user) return null;
  return (
    <div className="hidden p-4 lg:block">
      <div className="promo-card p-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
            <UserRound size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white" title={user.email}>{user.email}</p>
            <p className="text-xs text-white/70">{roleLabel(user.role)}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Link href="/account" className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white px-2 py-1.5 text-xs font-medium text-[#0e2a1d] hover:bg-white/90">
            <KeyRound size={13} aria-hidden="true" /> Account
          </Link>
          <button type="button" onClick={() => void signOut()} className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/30 px-2 py-1.5 text-xs text-white hover:bg-white/10">
            <LogOut size={13} aria-hidden="true" /> Sign out
          </button>
        </div>
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
