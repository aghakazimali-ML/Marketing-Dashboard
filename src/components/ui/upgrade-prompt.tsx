"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { FEATURE_LABELS, formatMoney, planPrice, planRequiredFor, type FeatureKey } from "@/lib/billing/plans";
import { useEntitlements } from "@/components/providers/entitlements-provider";

/** Shown in place of a feature the current plan does not include. */
export function UpgradePrompt({ feature, description }: { feature: FeatureKey; description?: string }) {
  const needed = planRequiredFor(feature);
  const { data } = useEntitlements();
  const currency = data?.billing.currency ?? "PKR";
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-sand-50/60 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-teal-500/15 text-teal-600">
        <Lock size={22} aria-hidden="true" />
      </span>
      <p className="font-display text-lg text-navy-900">{FEATURE_LABELS[feature]} is part of the {needed.name} plan</p>
      <p className="max-w-md text-sm text-muted">
        {description ?? `Upgrade to ${needed.name} (from ${formatMoney(planPrice(needed.id, "month", currency), currency)}/month) to unlock ${FEATURE_LABELS[feature].toLowerCase()}.`}
      </p>
      <Link href="/billing" className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-on-accent hover:bg-teal-500">
        See plans
      </Link>
    </div>
  );
}
