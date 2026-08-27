"use client";

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

export function TrendChart({
  data,
  xKey,
  series,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: { key: string; color: string; name?: string }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e8edf4" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={48} />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #d6dee8",
              fontSize: 12,
            }}
          />
          <Legend />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name ?? s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBarChart({
  data,
  xKey,
  bars,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  bars: { key: string; color: string; name?: string }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e8edf4" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={48} />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #d6dee8",
              fontSize: 12,
            }}
          />
          <Legend />
          {bars.map((b) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              name={b.name ?? b.key}
              fill={b.color}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
