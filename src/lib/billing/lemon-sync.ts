import { prisma } from "@/lib/db";
import { planForVariant, type LemonWebhook } from "@/lib/billing/lemonsqueezy";
import { logger } from "@/lib/logger";
import type { PlanId } from "@/lib/billing/plans";

export type LemonApplyResult =
  | { applied: true; plan: PlanId; status: string }
  | { applied: false; reason: "no_subscription" | "wrong_workspace" | "unknown_variant" | "stale" };

/** Does the checkout we created belong to this installation? (`custom_data.workspace` is set at checkout.) */
function belongsHere(custom: Record<string, unknown>) {
  return String(custom.workspace ?? "") === "1";
}

/**
 * Mirror a Lemon Squeezy subscription event onto the workspace. Idempotent and order-safe:
 * an event not newer than the last applied one (by `updated_at`) is ignored.
 */
export async function applyLemonEvent(evt: LemonWebhook): Promise<LemonApplyResult> {
  const sub = evt.subscription;
  if (!sub) return { applied: false, reason: "no_subscription" };

  const existing = await prisma.workspace.findUnique({ where: { id: 1 } });
  // Events for a subscription we already track are always ours; the first event must carry our custom_data.
  const known = existing?.lsSubscriptionId === sub.id;
  if (!known && !belongsHere(evt.custom)) return { applied: false, reason: "wrong_workspace" };

  // Older events, and exact replays (same subscription state timestamp), change nothing.
  if (known && existing?.lsUpdatedAt && sub.updatedAt && sub.updatedAt <= existing.lsUpdatedAt) return { applied: false, reason: "stale" };

  const mapped = planForVariant(sub.variantId);
  if (!mapped) {
    logger.warn("lemonsqueezy event for an unmapped variant", { variantId: sub.variantId });
    return { applied: false, reason: "unknown_variant" };
  }

  const active = ["active", "on_trial", "past_due"].includes(sub.status);
  const endDate = sub.status === "cancelled" ? sub.endsAt ?? sub.renewsAt : sub.renewsAt;
  const data = {
    plan: mapped.plan,
    planStatus: sub.status,
    billingProvider: "LEMONSQUEEZY",
    billingInterval: mapped.interval,
    currentPeriodEnd: endDate,
    cancelAtPeriodEnd: sub.cancelled || sub.status === "cancelled",
    lsCustomerId: sub.customerId,
    lsSubscriptionId: sub.id,
    lsPortalUrl: sub.portalUrl,
    lsUpdatedAt: sub.updatedAt ?? new Date(),
  };
  await prisma.workspace.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  return { applied: true, plan: active || (sub.status === "cancelled" && endDate && endDate > new Date()) ? mapped.plan : "FREE", status: sub.status };
}
