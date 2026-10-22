"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard, TextField, primaryButton } from "@/components/ui/auth-card";

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
  const [setupToken, setSetupToken] = useState("");
  const [setupTokenConfigured, setSetupTokenConfigured] = useState(true);
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
        setSetupTokenConfigured(setup.setupTokenConfigured !== false);
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
          ...(invite ? { inviteToken } : { setupToken }),
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

  const showForm = setupComplete === false || (setupComplete === true && Boolean(invite));
  const subtitle = showForm
    ? invite
      ? `Accept your ${invite.role.toLowerCase()} invitation`
      : "Create the owner account for this installation"
    : undefined;
  const linkClass = "font-semibold text-teal-700 hover:text-teal-600";

  return (
    <AuthCard title={showForm ? (invite ? "Accept your invitation" : "Create your account") : "Account setup"} subtitle={subtitle}>
      {setupComplete === true && !inviteToken ? (
        <div className="mt-5">
          <p className="text-sm text-muted">Account setup is complete. Ask an administrator for an invitation link.</p>
          <Link href="/login" className={`mt-4 inline-block text-sm ${linkClass}`}>Return to sign in</Link>
        </div>
      ) : setupComplete === true && checkingInvite ? (
        <p className="mt-5 text-sm text-muted">Checking invitation…</p>
      ) : setupComplete === true && inviteToken && !invite ? (
        <div className="mt-5">
          <p className="text-sm text-down">{error || "This invitation link is unavailable."}</p>
          <Link href="/login" className={`mt-4 inline-block text-sm ${linkClass}`}>Return to sign in</Link>
        </div>
      ) : setupComplete === null ? (
        <p className="mt-5 text-sm text-muted">Checking account setup…</p>
      ) : (
        <>
          {!invite && !setupTokenConfigured ? (
            <p role="alert" className="mt-4 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
              Owner setup is locked. Set <code>SETUP_TOKEN</code> in the server environment and restart, or run <code>npm run create-owner</code>.
            </p>
          ) : null}
          <form onSubmit={onSubmit} className="mt-2">
            {!invite ? (
              <TextField
                label="Setup token"
                type="password"
                required
                value={setupToken}
                onChange={(event) => setSetupToken(event.target.value)}
                autoComplete="off"
                hint="The SETUP_TOKEN value from your server configuration."
              />
            ) : null}
            <TextField label="Name" required minLength={1} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            <TextField label="Email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} readOnly={Boolean(invite)} autoComplete="email" />
            <TextField label="Password" type="password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" hint="At least 12 characters." />
            <TextField label="Confirm password" type="password" required minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />

            {error ? <p role="alert" className="mt-3 text-sm text-down">{error}</p> : null}

            <button type="submit" disabled={loading} className={primaryButton}>
              {loading ? "Creating account…" : "Create account"}
            </button>
            <p className="mt-3 text-center text-xs text-muted">
              By creating an account you agree to the{" "}
              <Link href="/terms" className="font-medium text-teal-700 hover:underline">Terms of Service</Link> and{" "}
              <Link href="/privacy" className="font-medium text-teal-700 hover:underline">Privacy Policy</Link>.
            </p>
          </form>
          <p className="mt-5 text-center text-sm text-muted">
            Already set up? <Link href="/login" className={linkClass}>Sign in</Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
