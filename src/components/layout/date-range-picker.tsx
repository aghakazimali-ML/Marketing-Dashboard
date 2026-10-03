"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { PRESET_OPTIONS, isDatePreset, validateCustomRange, type DatePreset } from "@/lib/metrics/periods";
import { useDateRange } from "@/components/providers/date-range-provider";
import { useEntitlements } from "@/components/providers/entitlements-provider";
import { FREE_PRESETS } from "@/lib/billing/plans";

const toInput = (d: Date) => format(d, "yyyy-MM-dd");
const fromInput = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

export function DateRangePicker() {
  const { range, setPreset, setCustom } = useDateRange();
  const { has } = useEntitlements();
  const customAllowed = has("customRange");
  const [custom, setCustomDraft] = useState(false);
  const [from, setFrom] = useState(toInput(range.start));
  const [to, setTo] = useState(toInput(range.end));
  const [error, setError] = useState<string | null>(null);
  const showCustom = custom || range.preset === "custom";

  // Keep the inputs in sync when the range changes elsewhere (URL, back button).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data / syncs external state on mount
    setFrom(toInput(range.start));
    setTo(toInput(range.end));
  }, [range.start, range.end]);

  function applyCustom(nextFrom: string, nextTo: string) {
    const problem = validateCustomRange(fromInput(nextFrom), fromInput(nextTo));
    setError(problem);
    if (!problem) setError(setCustom(fromInput(nextFrom) as Date, fromInput(nextTo) as Date));
  }

  const options = PRESET_OPTIONS.filter((o) => customAllowed || FREE_PRESETS.includes(o.value));
  const today = toInput(new Date());

  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="range-preset" className="text-xs font-medium tracking-wide text-muted uppercase">
          Period
        </label>
        <select
          id="range-preset"
          value={showCustom ? "custom" : range.preset}
          onChange={(e) => {
            const v = e.target.value;
            if (!isDatePreset(v)) return;
            if (v === "custom") {
              setCustomDraft(true);
              return;
            }
            setCustomDraft(false);
            setError(null);
            setPreset(v as DatePreset);
          }}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {showCustom && customAllowed ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="range-from">Start date</label>
          <input
            id="range-from"
            type="date"
            value={from}
            max={to || today}
            onChange={(e) => {
              setFrom(e.target.value);
              applyCustom(e.target.value, to);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "range-error" : undefined}
            className="rounded-md border border-line bg-surface px-2 py-2 text-sm"
          />
          <span aria-hidden="true" className="text-muted">→</span>
          <label className="sr-only" htmlFor="range-to">End date</label>
          <input
            id="range-to"
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => {
              setTo(e.target.value);
              applyCustom(from, e.target.value);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "range-error" : undefined}
            className="rounded-md border border-line bg-surface px-2 py-2 text-sm"
          />
        </div>
      ) : null}
      <span className="self-center text-xs text-muted">
        {format(range.start, "MMM d")} – {format(range.end, "MMM d, yyyy")}
      </span>
      {error ? (
        <p id="range-error" role="alert" className="basis-full text-xs text-down">
          {error}
        </p>
      ) : null}
    </div>
  );
}
