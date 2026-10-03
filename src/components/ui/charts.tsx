"use client";

import { useId, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
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
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 12,
} as const;

const AXIS = { fontSize: 11, fill: "var(--chart-axis)" } as const;

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
  const text = summary ?? `Line chart of ${series.map((s) => s.name ?? s.key).join(" and ")} over time.`;
  return (
    <ChartFrame summary={text} data={data} xKey={xKey} series={series}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tick={AXIS} />
          <YAxis tick={AXIS} width={48} tickFormatter={(v: number) => formatMetric(v, "number", true)} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatMetric(typeof v === "number" ? v : null)} />
          <Legend />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name ?? s.key}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "6 4" : undefined}
              dot={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

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
  return (
    <ChartFrame summary={text} data={data} xKey={xKey} series={bars}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tick={AXIS} />
          <YAxis tick={AXIS} width={48} tickFormatter={(v: number) => formatMetric(v, "number", true)} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatMetric(typeof v === "number" ? v : null)} />
          <Legend />
          {bars.map((b) => (
            <Bar key={b.key} dataKey={b.key} name={b.name ?? b.key} fill={b.color} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
