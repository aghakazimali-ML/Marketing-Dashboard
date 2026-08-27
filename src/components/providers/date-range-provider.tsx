"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  resolveDateRange,
  type DatePreset,
  type DateRange,
} from "@/lib/metrics/periods";

type DateRangeContextValue = {
  range: DateRange;
  setPreset: (preset: DatePreset) => void;
  setCustom: (start: Date, end: Date) => void;
};

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<DateRange>(() =>
    resolveDateRange("last_30")
  );

  const setPreset = useCallback((preset: DatePreset) => {
    setRange(resolveDateRange(preset));
  }, []);

  const setCustom = useCallback((start: Date, end: Date) => {
    setRange(resolveDateRange("custom", start, end));
  }, []);

  const value = useMemo(
    () => ({ range, setPreset, setCustom }),
    [range, setPreset, setCustom]
  );

  return (
    <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
}
