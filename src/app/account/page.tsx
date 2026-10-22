"use client";

import { FormEvent, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { useAuth } from "@/components/providers/auth-provider";
import { ACCENTS, useTheme, type Theme } from "@/components/providers/theme-provider";
import { useToast } from "@/components/providers/toast-provider";
import { apiRequest } from "@/lib/client/api";

export default function AccountPage() {
  return (
    <AppShell title="Account" subtitle="Your sign-in and appearance settings" hideRange>
      <AccountContent />
    </AppShell>
  );
}

function AccountContent() {
  const user = useAuth();
  const toast = useToast();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError("The new passwords do not match.");
    setSaving(true);
    try {
      await apiRequest("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
        redirectOn401: false,
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.push({ kind: "success", title: "Password changed", body: "Other devices have been signed out." });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setSaving(false);
    }
  }

  const input = "mt-1.5 w-full rounded-2xl border border-line bg-sand-50 px-4 py-3 text-sm text-ink transition-colors focus:border-teal-500 focus:bg-surface";
  const label = "block text-xs font-medium text-muted";
  const initial = (user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="crazy-card card-featured rise p-6 sm:p-8 lg:col-span-2">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xl font-semibold text-white">{initial}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/80">Signed in as</p>
            <p className="truncate text-2xl font-semibold tracking-tight text-white">{user?.email ?? "…"}</p>
            <span className="mt-2 inline-block rounded-full bg-white/20 px-3 py-0.5 text-xs font-semibold text-white">{user?.role === "ADMIN" ? "Administrator" : "Analyst"}</span>
          </div>
        </div>
      </section>

      <SectionCard title="Change password" subtitle="Changing your password signs out every other session.">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="pw-current" className={label}>Current password</label>
            <input id="pw-current" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className={input} />
          </div>
          <div>
            <label htmlFor="pw-new" className={label}>New password</label>
            <input id="pw-new" type="password" required minLength={12} maxLength={128} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" aria-describedby="pw-hint" className={input} />
            <p id="pw-hint" className="mt-1 text-[11px] text-muted">At least 12 characters.</p>
          </div>
          <div>
            <label htmlFor="pw-confirm" className={label}>Confirm new password</label>
            <input id="pw-confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={input} />
          </div>
          {error ? <p role="alert" className="text-sm text-down">{error}</p> : null}
          <button type="submit" disabled={saving} className="rounded-full bg-teal-600 px-6 py-3 text-sm font-semibold text-on-accent hover:bg-teal-500 disabled:opacity-50">
            {saving ? "Saving…" : "Change password"}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Appearance" subtitle="Applies to this browser only.">
        <fieldset>
          <legend className="text-xs font-medium text-muted">Accent colour</legend>
          <div className="mt-3 flex flex-wrap gap-3">
            {ACCENTS.map((a) => (
              <label key={a.value} className="cursor-pointer">
                <input type="radio" name="accent" className="peer sr-only" checked={accent === a.value} onChange={() => setAccent(a.value)} />
                <span className="flex items-center gap-2 rounded-full border-2 border-line px-4 py-2 text-sm font-medium transition-colors peer-checked:border-teal-500 peer-checked:bg-accent-tint peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]">
                  <span aria-hidden="true" className="size-4 rounded-full" style={{ background: a.swatch }} />
                  {a.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-6">
          <legend className="text-xs font-medium text-muted">Theme</legend>
          <div className="mt-3 inline-flex gap-1 rounded-full border border-line bg-sand-50 p-1">
            {(["system", "light", "dark"] as Theme[]).map((t) => (
              <label key={t} className="cursor-pointer">
                <input type="radio" name="theme" className="peer sr-only" checked={theme === t} onChange={() => setTheme(t)} />
                <span className="block rounded-full px-5 py-2 text-sm font-medium text-muted capitalize transition-colors peer-checked:bg-[var(--nav-active-bg)] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]">{t}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </SectionCard>
    </div>
  );
}
