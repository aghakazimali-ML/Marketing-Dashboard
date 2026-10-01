"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { DASHBOARD_NAME } from "@/lib/brand";

type InvitePreview = { email: string; role: "ADMIN" | "ANALYST" };

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted">
          Loading…
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const inviteFromQuery = params.get("invite");
  const [inviteToken, setInviteToken] = useState<string | null>(inviteFromQuery);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [checkingInvite, setCheckingInvite] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const inviteFromUrl =
      inviteFromQuery ||
      new URLSearchParams(window.location.hash.slice(1)).get("invite");
    async function loadSetup() {
      try {
        const response = await fetch("/api/auth/setup");
        if (!response.ok) throw new Error("Account setup status is unavailable.");
        const setup = await response.json();
        if (cancelled) return;
        setSetupComplete(Boolean(setup.setupComplete));
        setInviteToken(inviteFromUrl);

        if (setup.setupComplete && inviteFromUrl) {
          setCheckingInvite(true);
          const inviteResponse = await fetch("/api/auth/invites/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: inviteFromUrl }),
          });
          const inviteData = await inviteResponse.json().catch(() => ({}));
          if (cancelled) return;
          if (!inviteResponse.ok || !inviteData.valid) {
            setError("This invitation link is invalid, expired, or already used.");
          } else {
            setInvite({ email: inviteData.email, role: inviteData.role });
            setEmail(inviteData.email);
          }
          setCheckingInvite(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to check account setup.");
        }
      }
    }
    void loadSetup();
    return () => {
      cancelled = true;
    };
  }, [inviteFromQuery]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          ...(invite ? { inviteToken } : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Account setup failed.");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account setup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-stage flex min-h-screen items-center justify-center px-4 py-8">
      <div className="crazy-card w-full max-w-md rounded-2xl p-8">
        <div className="mb-5 flex justify-center text-teal-600">
          <BarChart3 size={36} strokeWidth={1.6} aria-hidden="true" />
        </div>
        <h1 className="font-display text-center text-2xl text-navy-900">
          {DASHBOARD_NAME}
        </h1>
        {setupComplete === true && !inviteToken ? (
          <div className="mt-5 text-center">
            <p className="text-sm text-muted">
              Account setup is complete. Ask an administrator for an invitation link.
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-teal-700 hover:text-teal-600">
              Return to sign in
            </Link>
          </div>
        ) : setupComplete === true && checkingInvite ? (
          <p className="mt-5 text-center text-sm text-muted">Checking invitation…</p>
        ) : setupComplete === true && inviteToken && !invite ? (
          <div className="mt-5 text-center">
            <p className="text-sm text-down">{error || "This invitation link is unavailable."}</p>
            <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-teal-700 hover:text-teal-600">
              Return to sign in
            </Link>
          </div>
        ) : setupComplete === null ? (
          <p className="mt-5 text-center text-sm text-muted">Checking account setup…</p>
        ) : (
          <>
            <p className="mt-1 text-center text-sm text-muted">
              {invite
                ? `Accept your ${invite.role.toLowerCase()} invitation`
                : "Create the owner account for this installation"}
            </p>
            <form onSubmit={onSubmit} className="mt-6">
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                  Name
                </span>
                <input
                  required
                  minLength={1}
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500"
                  autoComplete="name"
                />
              </label>

              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                  Email
                </span>
                <input
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  readOnly={Boolean(invite)}
                  className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500"
                  autoComplete="email"
                />
              </label>

              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                  Password
                </span>
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500"
                  autoComplete="new-password"
                />
              </label>

              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                  Confirm password
                </span>
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500"
                  autoComplete="new-password"
                />
              </label>

              {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}

              <button
                type="submit"
                disabled={loading}
                className="mt-6 w-full rounded-md bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
              >
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>
            <p className="mt-5 text-center text-sm text-muted">
              Already set up?{" "}
              <Link href="/login" className="font-semibold text-teal-700 hover:text-teal-600">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}