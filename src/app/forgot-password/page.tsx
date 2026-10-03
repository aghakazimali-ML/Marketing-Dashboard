"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AuthCard, TextField, primaryButton } from "@/components/ui/auth-card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Request failed");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Reset your password" subtitle="We will email you a link that works once for 30 minutes">
      {done ? (
        <p role="status" className="mt-6 rounded-md border border-up/40 bg-up/10 px-3 py-3 text-sm text-up">
          If an account exists for that email, a reset link is on its way. Check your inbox.
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {error ? <p role="alert" className="mt-3 text-sm text-down">{error}</p> : null}
          <button type="submit" disabled={loading} className={primaryButton}>{loading ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
      <p className="mt-5 text-center text-sm"><Link href="/login" className="font-medium text-teal-700 hover:underline">Back to sign in</Link></p>
    </AuthCard>
  );
}
