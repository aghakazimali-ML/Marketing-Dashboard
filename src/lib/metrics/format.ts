import { formatNumber } from "@/lib/metrics/periods";

export type MetricFormat = "number" | "percent" | "duration" | "signed";

export const EMPTY = "—";

/** Format a metric for display. `null`/undefined is "—", never "0". */
export function formatMetric(
  value: number | null | undefined,
  kind: MetricFormat = "number",
  compact = false
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  switch (kind) {
    case "percent":
      return `${value.toFixed(1)}%`;
    case "duration": {
      const m = Math.floor(value / 60);
      const s = Math.round(value % 60);
      return `${m}m ${s}s`;
    }
    case "signed":
      return `${value > 0 ? "+" : ""}${formatNumber(value, compact)}`;
    default:
      return formatNumber(value, compact);
  }
}
