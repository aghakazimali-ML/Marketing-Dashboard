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

  return { preset, start, end, label };
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

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

/** The period of equal length immediately before `range` (for "vs previous period" deltas). */
export function previousRange(range: DateRange): DateRange {
  const spanMs = range.end.getTime() - range.start.getTime() + 1;
  const end = new Date(range.start.getTime() - 1);
  const start = new Date(end.getTime() - spanMs + 1);
  return { preset: "custom", start: startOfDay(start), end: endOfDay(end), label: "Previous period" };
}

const DAY_MS = 86_400_000;

/** Validate a user-entered custom range. Returns an error message or null when valid. */
export function validateCustomRange(start: Date | null, end: Date | null, now = new Date()): string | null {
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Enter a valid start and end date.";
  }
  if (start > end) return "The start date must be on or before the end date.";
  if (startOfDay(end) > endOfDay(now)) return "The end date cannot be in the future.";
  if ((end.getTime() - start.getTime()) / DAY_MS > 366 * 2) return "Choose a range of two years or less.";
  return null;
}

export const PRESET_VALUES = PRESET_OPTIONS.map((o) => o.value);

export function isDatePreset(value: string | null | undefined): value is DatePreset {
  return Boolean(value && (PRESET_VALUES as string[]).includes(value));
}
