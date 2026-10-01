import { formatNumber } from "@/lib/metrics/periods";

export function MetricCard({
  label,
  value,
  format = "number",
  compact,
  hint,
}: {
  label: string;
  value: number;
  format?: "number" | "percent" | "duration";
  compact?: boolean;
  hint?: string;
}) {
  let display = formatNumber(value, compact);
  if (format === "percent") display = `${value.toFixed(1)}%`;
  if (format === "duration") {
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    display = `${m}m ${s}s`;
  }

  return (
    <div className="crazy-card rounded-xl border border-white/50 p-4">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="font-display text-2xl text-navy-900 tabular-nums">{display}</p>
      </div>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
