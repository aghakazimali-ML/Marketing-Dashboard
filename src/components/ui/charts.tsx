"use client";

import { useId, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { formatMetric } from "@/lib/metrics/format";

type Row = Record<string, string | number | null>;
type Series = { key: string; color: string; name?: string; dashed?: boolean };

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: "none",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 12,
  padding: "8px 12px",
  boxShadow: "0 8px 28px rgba(14, 42, 29, 0.16)",
} as const;

const AXIS = { fontSize: 11, fill: "var(--chart-axis)" } as const;
const LEGEND = { paddingBottom: 8, fontSize: 12 } as const;

/** useId() contains colons, which are not safe inside url(#...) references. */
function useSvgId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** Wraps a chart with a text summary and a "view as table" alternative (WCAG 1.1.1 / 1.3.1). */
function ChartFrame({
  summary,
  data,
  xKey,
  series,
  children,
}: {
  summary: string;
  data: Row[];
  xKey: string;
  series: Series[];
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const tableId = useId();
  if (!data.length) {
    return <p className="py-10 text-center text-sm text-muted">No data for this period.</p>;
  }
  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-xs text-muted">{summary}</p>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          aria-controls={tableId}
          className="shrink-0 rounded-md border border-line px-2 py-1 text-xs font-medium text-navy-900 hover:bg-sand-100"
        >
          {asTable ? "View as chart" : "View as table"}
        </button>
      </div>
      <div id={tableId}>
        {asTable ? (
          <div className="max-h-64 overflow-auto">
            <table className="min-w-full text-sm">
              <caption className="sr-only">{summary}</caption>
              <thead className="table-head text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">{xKey}</th>
                  {series.map((s) => (
                    <th key={s.key} scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-muted uppercase">{s.name ?? s.key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="border-t border-line/80">
                    <th scope="row" className="px-3 py-2 text-left font-normal">{String(row[xKey])}</th>
                    {series.map((s) => (
                      <td key={s.key} className="px-3 py-2 text-right tabular-nums">
                        {formatMetric(typeof row[s.key] === "number" ? (row[s.key] as number) : null)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-64 w-full" role="img" aria-label={summary}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/** Smooth area chart: the first series gets a soft gradient fill, the others are plain lines. */
export function TrendChart({
  data,
  xKey,
  series,
  summary,
}: {
  data: Row[];
  xKey: string;
  series: Series[];
  summary?: string;
}) {
  const text = summary ?? `Area chart of ${series.map((s) => s.name ?? s.key).join(" and ")} over time.`;
  const gradientId = useSvgId("area");
  return (
    <ChartFrame summary={text} data={data} xKey={xKey} series={series}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series[0]?.color ?? "var(--chart-1)"} stopOpacity={0.28} />
              <stop offset="100%" stopColor={series[0]?.color ?? "var(--chart-1)"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} tickMargin={8} />
          <YAxis tick={AXIS} width={48} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMetric(v, "number", true)} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "4 4" }} formatter={(v) => formatMetric(typeof v === "number" ? v : null)} />
          <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={LEGEND} />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name ?? s.key}
              stroke={s.color}
              strokeWidth={2.5}
              strokeDasharray={s.dashed ? "6 4" : undefined}
              fill={i === 0 ? `url(#${gradientId})` : "none"}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }}
              connectNulls={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/**
 * Pill-shaped bars. With a single series the tallest bar is solid and the rest are hatched
 * (the colour never carries the meaning alone: values are in the tooltip and the table view).
 */
export function SimpleBarChart({
  data,
  xKey,
  bars,
  summary,
}: {
  data: Row[];
  xKey: string;
  bars: Series[];
  summary?: string;
}) {
  const text = summary ?? `Bar chart of ${bars.map((b) => b.name ?? b.key).join(" and ")} by ${xKey}.`;
  const hatchId = useSvgId("hatch");
  const single = bars.length === 1 ? bars[0] : null;
  const max = single ? Math.max(...data.map((r) => (typeof r[single.key] === "number" ? (r[single.key] as number) : -Infinity))) : null;
  return (
    <ChartFrame summary={text} data={data} xKey={xKey} series={bars}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--sand-50)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-axis)" strokeOpacity="0.35" strokeWidth="2" />
            </pattern>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} tickMargin={8} />
          <YAxis tick={AXIS} width={48} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMetric(v, "number", true)} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--accent-tint)", radius: 12 }} formatter={(v) => formatMetric(typeof v === "number" ? v : null)} />
          {single ? null : <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={LEGEND} />}
          {bars.map((b) => (
            <Bar key={b.key} dataKey={b.key} name={b.name ?? b.key} fill={b.color} radius={999} maxBarSize={30}>
              {single
                ? data.map((r, i) => <Cell key={i} fill={r[single.key] === max ? single.color : `url(#${hatchId})`} />)
                : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Donut with the total in the middle: how a total splits across a few named parts. */
export function ShareDonut({
  data,
  totalLabel,
  summary,
}: {
  data: { name: string; value: number; color: string }[];
  totalLabel: string;
  summary?: string;
}) {
  const rows = data.filter((d) => d.value > 0);
  const total = rows.reduce((sum, d) => sum + d.value, 0);
  const text = summary ?? `Donut chart of ${totalLabel} by ${rows.map((d) => d.name).join(", ")}.`;
  return (
    <ChartFrame summary={text} data={rows.map((d) => ({ name: d.name, value: d.value }))} xKey="name" series={[{ key: "value", color: "var(--chart-1)", name: totalLabel }]}>
      <div className="relative h-full w-full">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={3} cornerRadius={8} stroke="none">
              {rows.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatMetric(typeof v === "number" ? v : null)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-3xl font-semibold tracking-tight text-navy-900 tabular-nums">{formatMetric(total, "number", true)}</p>
          <p className="text-xs text-muted">{totalLabel}</p>
        </div>
      </div>
    </ChartFrame>
  );
}
