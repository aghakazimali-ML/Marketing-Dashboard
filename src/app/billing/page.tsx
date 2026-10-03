"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Check, X } from "lucide-react";
import clsx from "clsx";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useAuth } from "@/components/providers/auth-provider";
import { useEntitlements } from "@/components/providers/entitlements-provider";
import { useToast } from "@/components/providers/toast-provider";
import { apiRequest } from "@/lib/client/api";
import { FEATURE_LABELS, PLANS, PLAN_ORDER, formatPkr, planRank, type FeatureKey, type PlanId } from "@/lib/billing/plans";
import { WorkspaceSettings } from "@/components/billing/workspace-settings";

export default function BillingPage() {
  return (
    <AppShell title="Plan & Billing" subtitle="Choose the plan that fits your team" hideRange>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <BillingContent />
      </Suspense>
    </AppShell>
  );
}

const limitText = (v: number | null) => (v === null ? "Unlimited" : String(v));

function BillingContent() {
  const user = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const { data, loading, reload } = useEntitlements();
  const [interval, setInterval_] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    const c = params.get("checkout");
    if (c === "success") {
      toast.push({ kind: "success", title: "Thanks! Your subscription is being activated", body: "It can take a few seconds for the plan to update." });
      const t = setTimeout(() => void reload(), 3000);
      return () => clearTimeout(t);
    }
    if (c === "cancelled") toast.push({ kind: "info", title: "Checkout cancelled" });
    if (c === "failed") toast.push({ kind: "error", title: "We could not confirm that payment", body: "If money left your account it will be applied automatically within a few minutes. Otherwise contact support with your order number." });
  }, [params, toast, reload]);

  const current = data?.plan.id ?? "FREE";
  const rows = useMemo(() => Object.keys(FEATURE_LABELS) as FeatureKey[], []);

  async function go(path: string, body?: object, id = path) {
    setBusy(id);
    setError(null);
    try {
      const { url } = await apiRequest<{ url: string }>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(null);
    }
  }

  if (loading && !data) return <Skeleton className="h-64 w-full" />;
  if (!data) return <ErrorState message="Could not load billing information." onRetry={() => void reload()} />;

  const managedByLicense = data.billing.managedByLicense;
  const canBuy = data.billing.configured && !managedByLicense;

  return (
    <div className="space-y-6">
      <SectionCard title={`You are on the ${data.plan.name} plan`} subtitle={data.plan.tagline}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Channels" value={`${data.usage.channels} / ${limitText(data.plan.limits.channels)}`} />
          <Stat label="Users" value={`${data.usage.seats} / ${limitText(data.plan.limits.seats)}`} />
          <Stat label="History" value={data.plan.limits.historyDays === null ? "Unlimited" : `${data.plan.limits.historyDays} days`} />
          <Stat label="Status" value={managedByLicense ? "Licensed by operator" : data.status.replace("_", " ")} />
        </dl>
        {data.currentPeriodEnd ? (
          <p className="mt-3 text-xs text-muted">
            {data.cancelAtPeriodEnd ? "Ends on" : "Renews on"} {format(new Date(data.currentPeriodEnd), "MMM d, yyyy")}
            {data.status === "past_due" ? " — payment failed, please update your card." : ""}
          </p>
        ) : null}
        {isAdmin && data.hasStripeCustomer && data.billing.configured && !managedByLicense ? (
          <button type="button" disabled={busy === "portal"} onClick={() => void go("/api/billing/portal", {}, "portal")} className="mt-4 rounded-md border border-line bg-card px-4 py-2 text-sm font-medium hover:bg-sand-100 disabled:opacity-50">
            {busy === "portal" ? "Opening…" : "Manage billing & invoices"}
          </button>
        ) : null}
      </SectionCard>

      {error ? <ErrorState message={error} /> : null}
      {data.billing.safepay?.environment === "sandbox" ? (
        <p role="status" className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          Safepay is in <strong>sandbox</strong> mode: test payments only, no real money is charged.
        </p>
      ) : null}
      {!data.billing.configured && !managedByLicense ? (
        <p role="status" className="rounded-md border border-line bg-sand-50 px-3 py-2 text-sm text-muted">
          Online payments are not configured on this installation, so upgrades are handled by the operator. Contact them to change your plan.
        </p>
      ) : null}

      <div className="flex items-center justify-center gap-2" role="group" aria-label="Billing interval">
        {(["month", "year"] as const).map((i) => (
          <button key={i} type="button" aria-pressed={interval === i} onClick={() => setInterval_(i)} className={clsx("rounded-md px-4 py-2 text-sm font-medium", interval === i ? "bg-navy-900 text-on-accent" : "border border-line bg-card hover:bg-sand-100")}>
            {i === "month" ? "Monthly" : "Yearly (2 months free)"}
          </button>
        ))}
      </div>

      <div id="plans" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const isCurrent = id === current;
          const price = interval === "month" ? p.pricePkrMonthly : Math.round(p.pricePkrYearly / 12);
          const upgrade = planRank(id) > planRank(current as PlanId);
          const safepayQuote = data.billing.provider === "SAFEPAY" && !managedByLicense ? data.billing.quotes?.[id]?.[interval] : undefined;
          return (
            <div key={id} className={clsx("crazy-card flex flex-col rounded-xl p-5", isCurrent && "ring-2 ring-teal-500", id === "PRO" && "border-teal-500/50")}>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl text-navy-900">{p.name}</h2>
                {isCurrent ? <span className="rounded bg-teal-500/15 px-2 py-0.5 text-[11px] font-semibold text-teal-600">Current</span> : id === "PRO" ? <span className="rounded bg-lime/30 px-2 py-0.5 text-[11px] font-semibold text-navy-900">Popular</span> : null}
              </div>
              <p className="mt-1 text-xs text-muted">{p.tagline}</p>
              <p className="mt-4 font-display text-3xl text-navy-900">
                {formatPkr(price)}
                {price > 0 ? <span className="text-sm font-normal text-muted"> /month{interval === "year" ? ", billed yearly" : ""}</span> : null}
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-2"><Check size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-up" /><span>{h}</span></li>
                ))}
              </ul>
              {id !== "FREE" ? (
                isAdmin && safepayQuote ? (
                  safepayQuote.ok ? (
                    <div className="mt-5 space-y-1.5">
                      <button type="button" disabled={busy !== null} onClick={() => void go("/api/billing/safepay/checkout", { plan: id, interval }, `buy-${id}`)} className="w-full rounded-md bg-teal-600 px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-teal-500 disabled:opacity-50">
                        {busy === `buy-${id}` ? "Redirecting to Safepay…" : `${safepayQuote.kind === "renewal" ? "Renew" : safepayQuote.kind === "upgrade" ? "Upgrade" : "Buy"} · ${formatPkr(safepayQuote.amountPkr)} with Safepay`}
                      </button>
                      <p className="text-center text-[11px] text-muted">
                        {interval === "year" ? "One payment for 12 months." : "One payment for 1 month."}
                        {safepayQuote.creditPkr > 0 ? ` Includes ${formatPkr(safepayQuote.creditPkr)} credit for the unused days of your current plan.` : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-5 text-center text-xs text-muted">{safepayQuote.reason}</p>
                  )
                ) : isAdmin && canBuy && upgrade && !data.hasStripeCustomer && data.billing.provider !== "SAFEPAY" ? (
                  <button type="button" disabled={busy !== null} onClick={() => void go("/api/billing/checkout", { plan: id, interval }, `buy-${id}`)} className="mt-5 rounded-md bg-teal-600 px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-teal-500 disabled:opacity-50">
                    {busy === `buy-${id}` ? "Redirecting…" : `Upgrade to ${p.name}`}
                  </button>
                ) : isAdmin && canBuy && data.hasStripeCustomer && !isCurrent ? (
                  <button type="button" disabled={busy !== null} onClick={() => void go("/api/billing/portal", {}, "portal")} className="mt-5 rounded-md border border-line bg-card px-4 py-2.5 text-sm font-medium hover:bg-sand-100 disabled:opacity-50">
                    Change plan in billing portal
                  </button>
                ) : (
                  <p className="mt-5 text-center text-xs text-muted">{isCurrent ? "Your current plan" : !isAdmin ? "Ask an administrator to upgrade" : "Contact the operator to upgrade"}</p>
                )
              ) : (
                <p className="mt-5 text-center text-xs text-muted">{isCurrent ? "Your current plan" : "Included with every installation"}</p>
              )}
            </div>
          );
        })}
      </div>

      <SectionCard title="Compare plans">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Feature comparison by plan</caption>
            <thead className="table-head text-left">
              <tr>
                <th scope="col" className="px-3 py-3 text-[11px] font-semibold uppercase text-muted">Feature</th>
                {PLAN_ORDER.map((id) => <th key={id} scope="col" className="px-3 py-3 text-center text-[11px] font-semibold uppercase text-muted">{PLANS[id].name}</th>)}
              </tr>
            </thead>
            <tbody>
              {(["channels", "seats", "historyDays"] as const).map((k) => (
                <tr key={k} className="border-t border-line/80">
                  <th scope="row" className="px-3 py-2 text-left font-normal">{k === "channels" ? "Connected channels" : k === "seats" ? "Users" : "History (days)"}</th>
                  {PLAN_ORDER.map((id) => <td key={id} className="px-3 py-2 text-center tabular-nums">{limitText(PLANS[id].limits[k])}</td>)}
                </tr>
              ))}
              <tr className="border-t border-line/80">
                <th scope="row" className="px-3 py-2 text-left font-normal">AI insights per day</th>
                {PLAN_ORDER.map((id) => <td key={id} className="px-3 py-2 text-center tabular-nums">{PLANS[id].limits.aiInsightsPerDay === 0 ? "—" : limitText(PLANS[id].limits.aiInsightsPerDay)}</td>)}
              </tr>
              {rows.map((f) => (
                <tr key={f} className="border-t border-line/80">
                  <th scope="row" className="px-3 py-2 text-left font-normal">{FEATURE_LABELS[f]}</th>
                  {PLAN_ORDER.map((id) => (
                    <td key={id} className="px-3 py-2 text-center">
                      {PLANS[id].features[f] ? <><Check size={16} aria-hidden="true" className="mx-auto text-up" /><span className="sr-only">Included</span></> : <><X size={16} aria-hidden="true" className="mx-auto text-muted" /><span className="sr-only">Not included</span></>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {isAdmin && data.billing.provider === "SAFEPAY" ? <PaymentHistory /> : null}
      {isAdmin ? <WorkspaceSettings /> : null}
    </div>
  );
}

type PaymentRow = { id: string; orderId: string; plan: string; interval: string; amountPkr: number; creditPkr: number; status: string; createdAt: string; paidAt: string | null };

function PaymentHistory() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const { data } = useEntitlements();
  useEffect(() => {
    apiRequest<{ payments: PaymentRow[] }>("/api/billing/payments")
      .then((r) => setRows(r.payments))
      .catch(() => setRows([]));
  }, [data?.plan.id]);
  return (
    <SectionCard title="Payment history" subtitle="Safepay payments for this workspace">
      {rows === null ? (
        <Skeleton className="h-16 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">No payments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Payment history</caption>
            <thead className="table-head text-left">
              <tr>
                {["Date", "Order", "Plan", "Amount", "Status"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-line/80">
                  <td className="px-3 py-2 whitespace-nowrap text-muted">{format(new Date(p.paidAt ?? p.createdAt), "MMM d, yyyy")}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.orderId}</td>
                  <td className="px-3 py-2 capitalize">{p.plan.toLowerCase()} · {p.interval === "year" ? "yearly" : "monthly"}</td>
                  <td className="px-3 py-2 tabular-nums">{formatPkr(p.amountPkr)}</td>
                  <td className="px-3 py-2">
                    <span className={clsx("rounded px-2 py-0.5 text-[11px] font-semibold", p.status === "PAID" ? "bg-up/10 text-up" : p.status === "PENDING" ? "bg-sand-100 text-muted" : "bg-down/10 text-down")}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-sand-50 px-3 py-2">
      <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 font-medium capitalize text-navy-900">{value}</dd>
    </div>
  );
}
