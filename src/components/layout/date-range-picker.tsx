"use client";

import { PRESET_OPTIONS, type DatePreset } from "@/lib/metrics/periods";
import { useDateRange } from "@/components/providers/date-range-provider";
import { format } from "date-fns";

export function DateRangePicker() {
  const { range, setPreset, setCustom } = useDateRange();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-xs font-medium tracking-wide text-muted uppercase">
        Period
      </label>
      <select
        value={range.preset}
        onChange={(e) => setPreset(e.target.value as DatePreset)}
        className="rounded-md border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-teal-500"
      >
        {PRESET_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {range.preset === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            defaultValue={format(range.start, "yyyy-MM-dd")}
            onChange={(e) => setCustom(new Date(e.target.value), range.end)}
            className="rounded-md border border-line bg-card px-2 py-2 text-sm"
          />
          <span className="text-muted">→</span>
          <input
            type="date"
            defaultValue={format(range.end, "yyyy-MM-dd")}
            onChange={(e) => setCustom(range.start, new Date(e.target.value))}
            className="rounded-md border border-line bg-card px-2 py-2 text-sm"
          />
        </div>
      )}
      <span className="text-xs text-muted">
        Selected range: {format(range.start, "MMM d")} – {format(range.end, "MMM d, yyyy")}
      </span>
    </div>
  );
}
