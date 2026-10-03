"use client";

import { FormEvent, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { useAuth } from "@/components/providers/auth-provider";
import { useTheme, type Theme } from "@/components/providers/theme-provider";
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
  const { theme, setTheme } = useTheme();
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

  const input = "mt-1 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink";
  const label = "block text-[11px] font-semibold tracking-wide text-muted uppercase";

  return (
    <div className="max-w-xl space-y-6">
      <SectionCard title="Signed in as">
        <p className="text-sm">{user?.email ?? "…"}</p>
        <p className="text-xs text-muted">{user?.role === "ADMIN" ? "Administrator" : "Analyst"}</p>
      </SectionCard>

      <SectionCard title="Change password" subtitle="Changing your password signs out every other session.">
        <form onSubmit={submit} className="space-y-3">
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
          <button type="submit" disabled={saving} className="rounded-md bg-teal-600 px-5 py-2.5 text-sm font-semibold text-on-accent hover:bg-teal-500 disabled:opacity-50">
            {saving ? "Saving…" : "Change password"}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Appearance">
        <div role="radiogroup" aria-label="Colour theme" className="flex gap-2">
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <label key={t} className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm capitalize">
              <input type="radio" name="theme" checked={theme === t} onChange={() => setTheme(t)} />
              {t}
            </label>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
