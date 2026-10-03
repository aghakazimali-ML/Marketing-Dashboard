import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import clsx from "clsx";
import { formatMetric, type MetricFormat } from "@/lib/metrics/format";
import { nullReasonText, type NullReason } from "@/lib/metrics/catalog";

/**
 * A KPI tile. `value === null` means "no value", which is shown as "—" with a reason,
 * never as 0. `delta` is the % change vs the previous period (null = not comparable).
 */
export function MetricCard({
  label,
  value,
  format = "number",
  compact,
  hint,
  delta,
  reason = "no_data",
  platformLabel,
  info,
  includes,
}: {
  label: string;
  value: number | null | undefined;
  format?: MetricFormat;
  compact?: boolean;
  hint?: string;
  delta?: number | null;
  reason?: NullReason;
  platformLabel?: string;
  /** Source / formula note shown as a tooltip. */
  info?: string;
  /** Platforms contributing to a cross-platform total. */
  includes?: string[];
}) {
  const empty = value === null || value === undefined;
  const display = formatMetric(value, format, compact);
  const reasonText = nullReasonText(reason, platformLabel);

  return (
    <div className="crazy-card rounded-xl border border-white/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{label}</p>
        {info ? (
          <span title={info} className="text-muted">
            <Info size={13} aria-hidden="true" />
            <span className="sr-only">{info}</span>
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p
          className={clsx("font-display text-2xl tabular-nums", empty ? "text-muted" : "text-navy-900")}
          title={empty ? reasonText : undefined}
        >
          {display}
          {empty ? <span className="sr-only"> — {reasonText}</span> : null}
        </p>
        {!empty && delta !== undefined ? <DeltaBadge delta={delta} /> : null}
      </div>
      {empty ? <p className="mt-2 text-xs text-muted">{reasonText}</p> : null}
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
      {!empty && includes && includes.length ? (
        <p className="mt-2 text-[11px] text-muted">Includes {includes.map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join(", ")}</p>
      ) : null}
    </div>
  );
}

/** Arrow + sign + text, so the meaning never depends on colour alone. */
export function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted" title="No comparable previous period">
        <Minus size={12} aria-hidden="true" />
        <span className="sr-only">No comparison available</span>
      </span>
    );
  }
  const up = delta > 0;
  const flat = delta === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={clsx("inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums", flat ? "text-muted" : up ? "text-up" : "text-down")}
      title="Change vs the previous period of equal length"
    >
      <Icon size={13} aria-hidden="true" />
      {up ? "+" : ""}
      {delta.toFixed(1)}%<span className="sr-only"> vs previous period</span>
    </span>
  );
}
