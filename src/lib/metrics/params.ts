import { resolveDateRange, type DatePreset } from "@/lib/metrics/periods";

export function parseRangeParams(sp: {
  preset?: string;
  from?: string;
  to?: string;
}) {
  const preset = (sp.preset as DatePreset) || "last_30";
  const from = sp.from ? new Date(sp.from) : undefined;
  const to = sp.to ? new Date(sp.to) : undefined;
  return resolveDateRange(preset, from, to);
}

/** Serialize range for client fetch query strings */
export function rangeQuery(preset: DatePreset, from?: string, to?: string) {
  const q = new URLSearchParams({ preset });
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  return q.toString();
}
