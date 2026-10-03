"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthCard, TextField, primaryButton } from "@/components/ui/auth-card";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The token lives in the URL fragment so it is never sent to servers or logged in referrers.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data / syncs external state on mount
    setToken(new URLSearchParams(window.location.hash.slice(1)).get("token"));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not reset the password.");
      router.replace("/login?reason=password_reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Choose a new password">
      {token === null ? (
        <p className="mt-6 text-center text-sm text-muted">This reset link is missing its token. <Link href="/forgot-password" className="text-teal-700 underline">Request a new one</Link>.</p>
      ) : (
        <form onSubmit={onSubmit}>
          <TextField label="New password" type="password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint="At least 12 characters." />
          <TextField label="Confirm password" type="password" required minLength={12} maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          {error ? <p role="alert" className="mt-3 text-sm text-down">{error}</p> : null}
          <button type="submit" disabled={loading} className={primaryButton}>{loading ? "Saving…" : "Set new password"}</button>
        </form>
      )}
    </AuthCard>
  );
}
