"use client";

import { FormEvent, useState } from "react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { BarChart3 } from "lucide-react";
import { DASHBOARD_NAME } from "@/lib/brand";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
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
      if (!res.ok) {
        throw new Error(json.error || "Login failed");
      }
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-stage flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="crazy-card w-full max-w-md rounded-2xl p-8"
      >
        <div className="mb-5 flex justify-center text-teal-600">
          <BarChart3 size={36} strokeWidth={1.6} aria-hidden="true" />
        </div>
        <h1 className="font-display text-center text-2xl text-navy-900">
          {DASHBOARD_NAME}
        </h1>
        <p className="mt-1 text-center text-sm text-muted">
          Sign in to access your workspace
        </p>

        <label className="mt-6 block text-sm">
          <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500"
            autoComplete="username"
          />
        </label>

        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">
            Password
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500"
            autoComplete="current-password"
          />
        </label>

        {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-md bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
        {setupComplete === false ? (
          <p className="mt-5 text-center text-sm text-muted">
            First time here?{" "}
            <Link href="/signup" className="font-semibold text-teal-700 hover:text-teal-600">
              Create your account
            </Link>
          </p>
        ) : null}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
