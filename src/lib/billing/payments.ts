import { addMonths, addYears, differenceInCalendarDays } from "date-fns";
import { prisma } from "@/lib/db";
import { PLANS, planRank, pricePkr, type BillingInterval, type PlanId } from "@/lib/billing/plans";
import { toSafepayAmount, type SafepayConfig } from "@/lib/billing/safepay";
import { logger } from "@/lib/logger";

/** Smallest amount we will ask Safepay to charge (after upgrade credit). */
export const MIN_CHARGE_PKR = 100;

export type PeriodState = {
  plan: PlanId;
  interval: BillingInterval | null;
  periodEnd: Date | null;
};

export type Quote =
  | { ok: true; amountPkr: number; creditPkr: number; kind: "new" | "renewal" | "upgrade"; startsAt: Date }
  | { ok: false; reason: string };

export function addPeriod(from: Date, interval: BillingInterval): Date {
  return interval === "year" ? addYears(from, 1) : addMonths(from, 1);
}

/**
 * Price a purchase against the currently paid Safepay period.
 *  - nothing active (Free / expired): full price, starts now
 *  - same plan: full price, extends from the current end (renewal)
 *  - higher plan: the unused days of the current plan are credited (daily value of its list price)
 *  - lower plan while active: refused until the current period ends
 */
export function quotePurchase(current: PeriodState, plan: PlanId, interval: BillingInterval, now = new Date()): Quote {
  if (plan === "FREE") return { ok: false, reason: "The Free plan needs no payment." };
  const price = pricePkr(plan, interval);
  const active = current.plan !== "FREE" && current.periodEnd !== null && current.periodEnd > now;
  if (!active) return { ok: true, amountPkr: price, creditPkr: 0, kind: "new", startsAt: now };

  if (plan === current.plan) {
    return { ok: true, amountPkr: price, creditPkr: 0, kind: "renewal", startsAt: current.periodEnd as Date };
  }
  if (planRank(plan) < planRank(current.plan)) {
    return { ok: false, reason: `Your ${PLANS[current.plan].name} plan is active until ${(current.periodEnd as Date).toISOString().slice(0, 10)}. You can switch to a lower plan after it ends.` };
  }
  const oldInterval = current.interval ?? "month";
  const oldList = pricePkr(current.plan, oldInterval);
  const periodDays = oldInterval === "year" ? 365 : 30;
  const remaining = Math.max(0, differenceInCalendarDays(current.periodEnd as Date, now));
  const credit = Math.min(Math.floor((oldList / periodDays) * remaining), price);
  const amount = Math.max(price - credit, Math.min(MIN_CHARGE_PKR, price));
  return { ok: true, amountPkr: amount, creditPkr: price - amount, kind: "upgrade", startsAt: now };
}

export async function currentPeriod(): Promise<PeriodState> {
  const row = await prisma.workspace.findUnique({ where: { id: 1 } });
  if (!row || row.billingProvider !== "SAFEPAY") return { plan: "FREE", interval: null, periodEnd: null };
  return { plan: row.plan, interval: (row.billingInterval as BillingInterval | null) ?? null, periodEnd: row.currentPeriodEnd };
}

/** Does the amount Safepay reports match what we asked for? (Unreported amounts are accepted.) */
export function amountMatches(expectedPkr: number, reported: number | null, unit: SafepayConfig["amountUnit"]): boolean {
  if (reported === null) return true;
  return Math.round(reported) === toSafepayAmount(expectedPkr, unit);
}

export type PaidResult =
  | { applied: true; plan: PlanId; periodEnd: Date }
  | { applied: false; reason: "unknown" | "already_paid" | "amount_mismatch" };

/**
 * Mark a payment PAID and extend the workspace's paid period, exactly once.
 * Called by both the signed webhook and the signed redirect, whichever arrives first.
 */
export async function applyPaidPayment(
  where: { tracker?: string; orderId?: string },
  info: { reference?: string | null; reportedAmount?: number | null; unit: SafepayConfig["amountUnit"] },
  now = new Date()
): Promise<PaidResult> {
  const payment = await prisma.payment.findFirst({ where: where.tracker ? { tracker: where.tracker } : { orderId: where.orderId } });
  if (!payment) return { applied: false, reason: "unknown" };
  if (payment.status === "PAID") return { applied: false, reason: "already_paid" };
  if (!amountMatches(payment.amountPkr, info.reportedAmount ?? null, info.unit)) {
    logger.error("safepay amount mismatch", { orderId: payment.orderId, expected: payment.amountPkr, reported: info.reportedAmount });
    return { applied: false, reason: "amount_mismatch" };
  }

  return prisma.$transaction(async (tx) => {
    // Only one caller flips PENDING/CANCELLED/FAILED -> PAID.
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: "PAID" } },
      data: { status: "PAID", paidAt: now, reference: info.reference ?? payment.reference },
    });
    if (claimed.count !== 1) return { applied: false as const, reason: "already_paid" as const };

    const ws = await tx.workspace.findUnique({ where: { id: 1 } });
    const interval = payment.interval as BillingInterval;
    const stillActiveSameProvider =
      ws?.billingProvider === "SAFEPAY" && ws.currentPeriodEnd !== null && ws.currentPeriodEnd > now && ws.plan !== "FREE";
    // Renewal of the same plan stacks onto the remaining time; anything else starts now.
    const start = stillActiveSameProvider && ws.plan === payment.plan ? (ws.currentPeriodEnd as Date) : now;
    const periodEnd = addPeriod(start, interval);

    await tx.workspace.upsert({
      where: { id: 1 },
      create: { id: 1, plan: payment.plan, planStatus: "active", billingProvider: "SAFEPAY", billingInterval: interval, currentPeriodEnd: periodEnd },
      update: {
        plan: payment.plan,
        planStatus: "active",
        billingProvider: "SAFEPAY",
        billingInterval: interval,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        renewalRemindedAt: null,
      },
    });
    return { applied: true as const, plan: payment.plan, periodEnd };
  });
}

export async function markPaymentFailed(where: { tracker?: string; orderId?: string }, status: "FAILED" | "CANCELLED") {
  await prisma.payment.updateMany({
    where: { ...(where.tracker ? { tracker: where.tracker } : { orderId: where.orderId }), status: "PENDING" },
    data: { status },
  });
}
