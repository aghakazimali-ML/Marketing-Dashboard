"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { PLANS, type FeatureKey, type Plan } from "@/lib/billing/plans";
import { useAuth } from "@/components/providers/auth-provider";
import { apiRequest } from "@/lib/client/api";
import { DASHBOARD_NAME } from "@/lib/brand";

export type Quote =
  | { ok: true; amountPkr: number; creditPkr: number; kind: "new" | "renewal" | "upgrade" }
  | { ok: false; reason: string };

type PlanKey = "STARTER" | "PRO" | "EXCLUSIVE";

export type Entitlements = {
  plan: Plan;
  brandName: string;
  status: string;
  source: "license" | "safepay" | "lemonsqueezy" | "default";
  interval: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasSubscription: boolean;
  usage: { channels: number; seats: number; pendingInvites: number };
  billing: {
    /** Detected from the visitor's IP; never chosen by the user. */
    region: "PK" | "INTL";
    country: string | null;
    currency: "PKR" | "USD";
    provider: "SAFEPAY" | "LEMONSQUEEZY";
    locked: boolean;
    safepay: { environment: "sandbox" | "production"; quotes: Record<PlanKey, Record<"month" | "year", Quote>> | null } | null;
    lemonsqueezy: { testMode: boolean; available: Record<PlanKey, Record<"month" | "year", boolean>> | null } | null;
    configured: boolean;
    managedByLicense: boolean;
  };
};

type Ctx = {
  plan: Plan;
  brandName: string;
  data: Entitlements | null;
  loading: boolean;
  has: (feature: FeatureKey) => boolean;
  reload: () => Promise<void>;
};

const EntitlementsContext = createContext<Ctx>({
  plan: PLANS.FREE,
  brandName: DASHBOARD_NAME,
  data: null,
  loading: true,
  has: () => false,
  reload: async () => undefined,
});

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const user = useAuth();
  const [data, setData] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const json = await apiRequest<Entitlements>("/api/billing/entitlements", { redirectOn401: false });
      // The server sends the plan id's catalogue entry; re-read it from the shared catalogue so
      // limits/features can never drift from what the UI shows.
      setData({ ...json, plan: PLANS[json.plan.id] ?? json.plan });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data / syncs external state on mount
    if (user) void reload();
    else setLoading(false);
  }, [user, reload]);

  const value = useMemo<Ctx>(() => {
    const plan = data?.plan ?? PLANS.FREE;
    // While loading, assume nothing is locked so paid users do not see a flash of upgrade prompts.
    return { plan, brandName: data?.brandName ?? DASHBOARD_NAME, data, loading, has: (f) => (loading ? true : plan.features[f]), reload };
  }, [data, loading, reload]);

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlements() {
  return useContext(EntitlementsContext);
}

/** The product name to show (white-label name on plans that include it). */
export function useBrand() {
  return useContext(EntitlementsContext).brandName;
}
