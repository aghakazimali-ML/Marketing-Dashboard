"use client";

import { useId } from "react";
import { BarChart3 } from "lucide-react";
import { useBrand } from "@/components/providers/entitlements-provider";

export function AuthCard({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  const brand = useBrand();
  return (
    <div className="app-stage flex min-h-screen items-center justify-center px-4 py-8">
      <main id="main" className="crazy-card w-full max-w-md rounded-2xl p-8">
        <div className="mb-5 flex justify-center text-teal-600">
          <BarChart3 size={36} strokeWidth={1.6} aria-hidden="true" />
        </div>
        <h1 className="text-center font-display text-2xl text-navy-900">{title ?? brand}</h1>
        {subtitle ? <p className="mt-1 text-center text-sm text-muted">{subtitle}</p> : null}
        {children}
      </main>
    </div>
  );
}

export function TextField({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="mt-3 block text-sm">
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink" />
      {hint ? <p id={`${id}-hint`} className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

export const primaryButton =
  "mt-6 w-full rounded-md bg-teal-600 py-2.5 text-sm font-semibold text-on-accent hover:bg-teal-500 disabled:opacity-50";
