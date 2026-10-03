import { parseRangeParams } from "@/lib/metrics/params";
import { resolveDateRange, type DateRange } from "@/lib/metrics/periods";
import { clampRangeToPlan, getWorkspace } from "@/lib/billing/workspace";
import { FREE_PRESETS, type Plan } from "@/lib/billing/plans";

export type RequestRange = {
  range: DateRange;
  plan: Plan;
  /** True when the requested range was narrowed by the plan's history limit. */
  clamped: boolean;
};

/**
 * Parse the range query and enforce plan limits server-side:
 * custom ranges / long presets need the plan feature, and history is capped by `historyDays`.
 */
export async function resolveRequestRange(sp: { preset?: string; from?: string; to?: string }): Promise<RequestRange> {
  const { plan } = await getWorkspace();
  let range = parseRangeParams(sp);
  if (!plan.features.customRange && !FREE_PRESETS.includes(range.preset)) {
    range = resolveDateRange("last_30");
  }
  const clampedRange = clampRangeToPlan(range, plan);
  return { range: clampedRange, plan, clamped: clampedRange.start.getTime() !== range.start.getTime() };
}
