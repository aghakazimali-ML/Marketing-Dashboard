import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import clsx from "clsx";
import type { CSSProperties } from "react";
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
  featured,
  index = 0,
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
  /** Solid accent card: used for the single headline KPI on a page. */
  featured?: boolean;
  /** Position in the grid, used to stagger the entrance animation. */
  index?: number;
}) {
  const empty = value === null || value === undefined;
  const display = formatMetric(value, format, compact);
  const reasonText = nullReasonText(reason, platformLabel);

  return (
    <div className={clsx("crazy-card hover-lift rise p-5", featured && "card-featured")} style={{ "--i": index } as CSSProperties}>
      <div className="flex items-start justify-between gap-2">
        <p className={clsx("text-sm font-medium", featured ? "text-white/85" : "text-muted")}>{label}</p>
        {info ? (
          <span title={info} className="text-muted">
            <Info size={13} aria-hidden="true" />
            <span className="sr-only">{info}</span>
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p
          className={clsx("text-4xl font-semibold tracking-tight tabular-nums", empty ? "text-muted" : featured ? "text-white" : "text-navy-900")}
          title={empty ? reasonText : undefined}
        >
          {display}
          {empty ? <span className="sr-only"> — {reasonText}</span> : null}
        </p>
        {!empty && delta !== undefined ? <DeltaBadge delta={delta} onDark={featured} /> : null}
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
export function DeltaBadge({ delta, onDark }: { delta: number | null; onDark?: boolean }) {
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
      className={clsx("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", onDark ? "bg-white/15 text-white" : flat ? "bg-sand-100 text-muted" : up ? "bg-accent-tint text-up" : "bg-down/10 text-down")}
      title="Change vs the previous period of equal length"
    >
      <Icon size={13} aria-hidden="true" />
      {up ? "+" : ""}
      {delta.toFixed(1)}%<span className="sr-only"> vs previous period</span>
    </span>
  );
}
