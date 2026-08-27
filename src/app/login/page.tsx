"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("admin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, username }),
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
        <div className="mb-6 flex justify-center rounded-xl bg-[#061820] p-4">
          <Image
            src="/nets-logo.png"
            alt="NETS"
            width={180}
            height={72}
            priority
            className="h-auto w-full max-w-[180px]"
          />
        </div>
        <h1 className="font-display text-center text-2xl text-navy-900">
          Marketing Performance
        </h1>
        <p className="mt-1 text-center text-sm text-muted">
          Sign in to access the internal dashboard
        </p>

        <label className="mt-6 block text-sm">
          <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">
            Username
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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

        <p className="mt-6 text-center text-[10px] text-muted">
          Design and Developed by Agha Kazim Ali
        </p>
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
