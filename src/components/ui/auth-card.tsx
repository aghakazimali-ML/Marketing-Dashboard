"use client";

import { useId } from "react";
import { BarChart3 } from "lucide-react";
import { LegalLinks } from "@/components/legal/legal-links";
import { useBrand } from "@/components/providers/entitlements-provider";

const PREVIEW_BARS = [38, 62, 48, 86, 56, 30, 44];

/** Decorative product preview for the brand panel (not real data, hidden from assistive tech). */
function BrandPanel() {
  return (
    <aside aria-hidden="true" className="promo-card relative hidden flex-col justify-between p-10 lg:flex">
      <div />
      <div className="my-10 space-y-4">
        <div className="rise ml-auto w-64 rounded-3xl bg-white p-5 text-[#0e2a1d] shadow-xl" style={{ "--i": 2 } as React.CSSProperties}>
          <p className="text-xs font-medium text-[#5f7367]">Total reach</p>
          <div className="mt-1 flex items-end justify-between">
            <p className="text-3xl font-semibold tracking-tight">128.4K</p>
            <span className="rounded-full bg-[#e3f1e9] px-2 py-0.5 text-xs font-semibold text-[#157a4a]">+12.4%</span>
          </div>
          <div className="mt-4 flex h-16 items-end gap-1.5">
            {PREVIEW_BARS.map((h, i) => (
              <span
                key={i}
                className="w-full rounded-full"
                style={{
                  height: `${h}%`,
                  background: i === 3 ? "#14583a" : "repeating-linear-gradient(135deg, #f3f6f4 0 3px, #cfdad3 3px 5px)",
                }}
              />
            ))}
          </div>
        </div>
        <div className="rise w-56 rounded-3xl bg-white/10 p-5 backdrop-blur-sm" style={{ "--i": 4 } as React.CSSProperties}>
          <p className="text-xs text-white/75">Engagement rate</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">4.8%</p>
          <div className="mt-3 h-2 rounded-full bg-white/15">
            <div className="h-2 w-3/5 rounded-full bg-white" />
          </div>
        </div>
      </div>
      <div>
        <p className="text-3xl leading-tight font-semibold tracking-tight">Every channel,<br />one calm view.</p>
        <p className="mt-2 text-sm text-white/75">LinkedIn, Facebook, Instagram, YouTube and your website in one place.</p>
      </div>
    </aside>
  );
}

export function AuthCard({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  const brand = useBrand();
  return (
    <div className="app-stage grid min-h-screen gap-4 p-4 lg:grid-cols-2">
      <main id="main" className="rise flex items-center justify-center rounded-[28px] bg-surface px-6 py-10 shadow-[var(--card-shadow)]">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-teal-600 text-on-accent">
              <BarChart3 size={22} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-navy-900">{brand}</span>
          </div>
          <h1 className="text-3xl text-navy-900">{title ?? "Welcome back"}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
          {children}
          <LegalLinks className="mt-8" />
        </div>
      </main>
      <BrandPanel />
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
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} className="w-full rounded-2xl border border-line bg-sand-50 px-4 py-3 text-sm text-ink transition-colors focus:border-teal-500 focus:bg-surface" />
      {hint ? <p id={`${id}-hint`} className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

export const primaryButton =
  "mt-6 w-full rounded-full bg-teal-600 py-3 text-sm font-semibold text-on-accent transition-colors hover:bg-teal-500 disabled:opacity-50";
