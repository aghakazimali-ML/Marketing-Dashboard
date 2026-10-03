import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getPlan, isPlanId, planRequiredFor, type FeatureKey, type Plan, type PlanId } from "@/lib/billing/plans";
import { addDays, endOfDay, startOfDay } from "date-fns";
import type { DateRange } from "@/lib/metrics/periods";

export type WorkspaceState = {
  plan: Plan;
  planId: PlanId;
  status: string;
  /** "license" = fixed by the operator (LICENSE_PLAN); "safepay" = prepaid period (Pakistan); "lemonsqueezy" = subscription (international); "default" = free. */
  source: "license" | "safepay" | "lemonsqueezy" | "default";
  billingProvider: "SAFEPAY" | "LEMONSQUEEZY" | null;
  interval: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** Lemon Squeezy customer portal (manage card, cancel, invoices), when subscribed. */
  portalUrl: string | null;
};

/** Lemon Squeezy statuses that keep paid access (a failed renewal keeps access while it is retried). */
const LS_ACTIVE = new Set(["active", "on_trial", "past_due"]);

/** Plan fixed by the operator (offline licence / managed hosting). Overrides payment state. */
export function licensedPlan(): PlanId | null {
  const v = process.env.LICENSE_PLAN?.trim().toUpperCase();
  return isPlanId(v) ? v : null;
}

export async function getWorkspace(now = new Date()): Promise<WorkspaceState> {
  const row = await prisma.workspace.findUnique({ where: { id: 1 } });
  const free = (over: Partial<WorkspaceState> = {}): WorkspaceState => ({
    plan: getPlan("FREE"), planId: "FREE", status: "active", source: "default", billingProvider: null,
    interval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, portalUrl: null, ...over,
  });

  const licensed = licensedPlan();
  if (licensed) return free({ plan: getPlan(licensed), planId: licensed, source: "license" });
  if (!row) return free();

  // Safepay is prepaid: the paid plan is valid until currentPeriodEnd, then the workspace falls back to Free.
  if (row.billingProvider === "SAFEPAY") {
    const live = row.currentPeriodEnd !== null && row.currentPeriodEnd > now;
    const effective: PlanId = live ? row.plan : "FREE";
    return free({
      plan: getPlan(effective), planId: effective, status: live ? "active" : "expired", source: live ? "safepay" : "default",
      billingProvider: "SAFEPAY", interval: row.billingInterval, currentPeriodEnd: row.currentPeriodEnd, cancelAtPeriodEnd: true,
    });
  }

  // Lemon Squeezy subscription. A cancelled subscription keeps access until its end date; expired/unpaid/paused fall back to Free
  // (data is kept, paid features lock).
  if (row.billingProvider === "LEMONSQUEEZY") {
    const running = LS_ACTIVE.has(row.planStatus);
    const grace = row.planStatus === "cancelled" && row.currentPeriodEnd !== null && row.currentPeriodEnd > now;
    const effective: PlanId = running || grace ? row.plan : "FREE";
    return free({
      plan: getPlan(effective), planId: effective, status: row.planStatus, source: effective === "FREE" ? "default" : "lemonsqueezy",
      billingProvider: "LEMONSQUEEZY", interval: row.billingInterval, currentPeriodEnd: effective === "FREE" ? null : row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd || row.planStatus === "cancelled", portalUrl: row.lsPortalUrl,
    });
  }
  return free({ status: row.planStatus });
}

export async function getUsage() {
  const [channels, owner, members] = await Promise.all([
    prisma.channel.count({ where: { isActive: true } }),
    prisma.dashboardOwner.count(),
    prisma.teamMember.count({ where: { isActive: true } }),
  ]);
  const pendingInvites = await prisma.teamInvite.count({ where: { acceptedAt: null, expiresAt: { gt: new Date() } } });
  return { channels, seats: owner + members, pendingInvites };
}

export function upgradeResponse(feature: FeatureKey, message?: string) {
  const needed = planRequiredFor(feature);
  return NextResponse.json(
    {
      error: message ?? `This feature is available on the ${needed.name} plan and above.`,
      code: "plan_required",
      feature,
      requiredPlan: needed.id,
    },
    { status: 402 }
  );
}

/** Server-side feature gate. Returns a 402 response to send when the plan does not include it. */
export async function gateFeature(feature: FeatureKey) {
  const ws = await getWorkspace();
  if (ws.plan.features[feature]) return { ok: true as const, workspace: ws };
  return { ok: false as const, response: upgradeResponse(feature) };
}

/** Clamp a requested range to the plan's history window. */
export function clampRangeToPlan(range: DateRange, plan: Plan, now = new Date()): DateRange {
  const days = plan.limits.historyDays;
  if (days === null) return range;
  const earliest = startOfDay(addDays(now, -(days - 1)));
  if (range.start >= earliest) return range;
  return { ...range, start: earliest, end: range.end < earliest ? endOfDay(earliest) : range.end };
}

export function planLimitResponse(what: "channels" | "seats", limit: number, planName: string) {
  const label = what === "channels" ? "connected channels" : "users";
  return NextResponse.json(
    {
      error: `Your ${planName} plan includes up to ${limit} ${label}. Upgrade to add more.`,
      code: "plan_limit",
      limit: what,
    },
    { status: 402 }
  );
}

export type { NextRequest };
