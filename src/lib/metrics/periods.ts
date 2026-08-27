import {
  subDays,
  subMonths,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  differenceInCalendarDays,
} from "date-fns";

export type DatePreset =
  | "last_7"
  | "last_30"
  | "last_month"
  | "last_2_months"
  | "last_quarter"
  | "last_6_months"
  | "ytd"
  | "custom";

export type DateRange = {
  preset: DatePreset;
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  label: string;
};

export const PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: "last_7", label: "Last 7 Days" },
  { value: "last_30", label: "Last 30 Days" },
  { value: "last_month", label: "Last Month" },
  { value: "last_2_months", label: "Last 2 Months" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "last_6_months", label: "Last 6 Months" },
  { value: "ytd", label: "Year to Date" },
  { value: "custom", label: "Custom Range" },
];

function previousEquivalent(start: Date, end: Date): { previousStart: Date; previousEnd: Date } {
  const days = differenceInCalendarDays(end, start) + 1;
  const previousEnd = endOfDay(subDays(start, 1));
  const previousStart = startOfDay(subDays(previousEnd, days - 1));
  return { previousStart, previousEnd };
}

export function resolveDateRange(
  preset: DatePreset,
  customStart?: Date,
  customEnd?: Date,
  now = new Date()
): DateRange {
  let start: Date;
  let end: Date;
  let label: string;

  switch (preset) {
    case "last_7":
      end = endOfDay(now);
      start = startOfDay(subDays(now, 6));
      label = "Last 7 Days";
      break;
    case "last_30":
      end = endOfDay(now);
      start = startOfDay(subDays(now, 29));
      label = "Last 30 Days";
      break;
    case "last_month": {
      const prev = subMonths(now, 1);
      start = startOfMonth(prev);
      end = endOfMonth(prev);
      label = "Last Month";
      break;
    }
    case "last_2_months":
      end = endOfMonth(subMonths(now, 1));
      start = startOfMonth(subMonths(now, 2));
      label = "Last 2 Months";
      break;
    case "last_quarter": {
      const q = subMonths(now, 3);
      start = startOfQuarter(q);
      end = endOfQuarter(q);
      label = "Last Quarter";
      break;
    }
    case "last_6_months":
      end = endOfDay(now);
      start = startOfDay(subMonths(now, 6));
      label = "Last 6 Months";
      break;
    case "ytd":
      start = startOfYear(now);
      end = endOfDay(now);
      label = "Year to Date";
      break;
    case "custom":
      start = startOfDay(customStart ?? subDays(now, 29));
      end = endOfDay(customEnd ?? now);
      label = "Custom Range";
      break;
    default:
      end = endOfDay(now);
      start = startOfDay(subDays(now, 29));
      label = "Last 30 Days";
  }

  const { previousStart, previousEnd } = previousEquivalent(start, end);
  return { preset, start, end, previousStart, previousEnd, label };
}

export type MetricDelta = {
  current: number;
  previous: number;
  diff: number;
  pctChange: number | null;
  trend: "up" | "down" | "flat";
};

export function compareMetric(current: number, previous: number): MetricDelta {
  const diff = current - previous;
  const pctChange = previous === 0 ? (current === 0 ? 0 : null) : (diff / previous) * 100;
  const trend = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  return { current, previous, diff, pctChange, trend };
}

export function formatNumber(n: number, compact = false): string {
  if (compact) {
    return new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat("en").format(Math.round(n));
}

export function formatPct(n: number | null, digits = 1): string {
  if (n === null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}
