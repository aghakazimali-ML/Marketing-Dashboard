"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  isDatePreset,
  resolveDateRange,
  validateCustomRange,
  type DatePreset,
  type DateRange,
} from "@/lib/metrics/periods";

type DateRangeContextValue = {
  range: DateRange;
  setPreset: (preset: DatePreset) => void;
  /** Returns an error message when the range is invalid (and leaves the current range unchanged). */
  setCustom: (start: Date, end: Date) => string | null;
  /** "?preset=…" (plus from/to for custom) to append to internal links so the range travels with navigation. */
  search: string;
};

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

function parseDay(value: string | null): Date | null {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function fromParams(sp: URLSearchParams): DateRange {
  const preset = sp.get("preset");
  if (!isDatePreset(preset)) return resolveDateRange("last_30");
  if (preset === "custom") {
    const start = parseDay(sp.get("from"));
    const end = parseDay(sp.get("to"));
    if (start && end && !validateCustomRange(start, end)) return resolveDateRange("custom", start, end);
    return resolveDateRange("last_30");
  }
  return resolveDateRange(preset);
}

function toSearch(range: DateRange): string {
  const q = new URLSearchParams({ preset: range.preset });
  if (range.preset === "custom") {
    q.set("from", format(range.start, "yyyy-MM-dd"));
    q.set("to", format(range.end, "yyyy-MM-dd"));
  }
  return q.toString();
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlKey = useMemo(
    () => [searchParams.get("preset") ?? "", searchParams.get("from") ?? "", searchParams.get("to") ?? ""].join("|"),
    [searchParams]
  );

  const [range, setRange] = useState<DateRange>(() => fromParams(new URLSearchParams(searchParams.toString())));
  const [lastUrlKey, setLastUrlKey] = useState(urlKey);

  // Back/forward navigation or a pasted link changed the URL: follow it.
  if (urlKey !== lastUrlKey) {
    setLastUrlKey(urlKey);
    if (searchParams.get("preset")) setRange(fromParams(new URLSearchParams(searchParams.toString())));
  }

  const writeUrl = useCallback(
    (next: DateRange) => {
      const q = new URLSearchParams(searchParams.toString());
      for (const k of ["preset", "from", "to"]) q.delete(k);
      new URLSearchParams(toSearch(next)).forEach((v, k) => q.set(k, v));
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const setPreset = useCallback(
    (preset: DatePreset) => {
      const next = resolveDateRange(preset);
      setRange(next);
      if (preset !== "custom") writeUrl(next);
    },
    [writeUrl]
  );

  const setCustom = useCallback(
    (start: Date, end: Date) => {
      const problem = validateCustomRange(start, end);
      if (problem) return problem;
      const next = resolveDateRange("custom", start, end);
      setRange(next);
      writeUrl(next);
      return null;
    },
    [writeUrl]
  );

  // Rolling presets advance at local midnight.
  useEffect(() => {
    let currentDay = new Date().toDateString();
    const timer = setInterval(() => {
      const now = new Date();
      if (now.toDateString() === currentDay) return;
      currentDay = now.toDateString();
      setRange((cur) => (cur.preset === "custom" ? cur : resolveDateRange(cur.preset, undefined, undefined, now)));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const search = useMemo(() => `?${toSearch(range)}`, [range]);
  const value = useMemo(() => ({ range, setPreset, setCustom, search }), [range, setPreset, setCustom, search]);
  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
}
