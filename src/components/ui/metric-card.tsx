import clsx from "clsx";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatNumber, formatPct, type MetricDelta } from "@/lib/metrics/periods";

export function TrendBadge({ delta, invertColors = false }: { delta: MetricDelta; invertColors?: boolean }) {
  const upGood = !invertColors;
  const positive = delta.trend === "up";
  const negative = delta.trend === "down";
  const good = (positive && upGood) || (negative && !upGood);
  const bad = (negative && upGood) || (positive && !upGood);

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 text-xs font-medium",
        good && "text-up",
        bad && "text-down",
        delta.trend === "flat" && "text-muted"
      )}
    >
      {delta.trend === "up" && <TrendingUp size={13} />}
      {delta.trend === "down" && <TrendingDown size={13} />}
      {delta.trend === "flat" && <Minus size={13} />}
      {formatPct(delta.pctChange)}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  delta,
  format = "number",
  compact,
  invertColors,
  hint,
}: {
  label: string;
  value: number;
  delta?: MetricDelta;
  format?: "number" | "percent" | "duration";
  compact?: boolean;
  invertColors?: boolean;
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
        {delta ? <TrendBadge delta={delta} invertColors={invertColors} /> : null}
      </div>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
