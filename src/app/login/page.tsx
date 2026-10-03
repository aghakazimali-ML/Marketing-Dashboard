"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthCard, TextField, primaryButton } from "@/components/ui/auth-card";
import { safeNextPath } from "@/lib/auth/paths";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // SEC-5: only same-site relative paths are honoured.
  const next = safeNextPath(params.get("next"));
  const reason = params.get("reason");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((res) => res.json())
      .then((data) => setSetupComplete(Boolean(data.setupComplete)))
      .catch(() => setSetupComplete(true));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Login failed");
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard subtitle="Sign in to access your workspace">
      {reason === "expired" ? (
        <p role="status" className="mt-4 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">Your session expired. Please sign in again.</p>
      ) : null}
      {reason === "signed_out" ? <p role="status" className="mt-4 rounded-md border border-line bg-sand-50 px-3 py-2 text-sm text-muted">You have been signed out.</p> : null}
      {reason === "password_reset" ? <p role="status" className="mt-4 rounded-md border border-up/40 bg-up/10 px-3 py-2 text-sm text-up">Password updated. Sign in with your new password.</p> : null}
      <form onSubmit={onSubmit} className="mt-2">
        <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <TextField label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error ? <p role="alert" className="mt-3 text-sm text-down">{error}</p> : null}
        <button type="submit" disabled={loading} className={primaryButton}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="font-medium text-teal-700 hover:underline">Forgot your password?</Link>
      </p>
      {setupComplete === false ? (
        <p className="mt-3 text-center text-sm text-muted">
          First time here?{" "}
          <Link href="/signup" className="font-semibold text-teal-700 hover:text-teal-600">Create the owner account</Link>
        </p>
      ) : null}
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
