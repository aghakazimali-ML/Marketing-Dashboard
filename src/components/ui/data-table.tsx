"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";

export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  highlightBest,
  getHighlightValue,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  highlightBest?: boolean;
  getHighlightValue?: (row: T) => number;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "desc" ? bv - av : av - bv;
      }
      return sortDir === "desc"
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });
  }, [rows, sortKey, sortDir, columns]);

  const bestId =
    highlightBest && getHighlightValue && sorted.length
      ? rowKey(
          [...sorted].sort((a, b) => getHighlightValue(b) - getHighlightValue(a))[0]
        )
      : null;

  function onSort(col: Column<T>) {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(col.key);
      setSortDir("desc");
    }
  }

  return (
    <div className="crazy-card overflow-x-auto rounded-xl border border-white/50">
      <table className="min-w-full text-sm">
        <thead className="bg-gradient-to-r from-[#d4f5e4]/80 via-white/50 to-[#e0f7ff]/80 text-left">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(
                  "px-3 py-3 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase whitespace-nowrap",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  col.sortable && "cursor-pointer select-none hover:text-navy-900",
                  col.className
                )}
                onClick={() => onSort(col)}
              >
                {col.header}
                {sortKey === col.key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const id = rowKey(row);
            return (
              <tr
                key={id}
                className={clsx(
                  "border-t border-line/80",
                  bestId === id && "bg-teal-500/5"
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      "px-3 py-3 whitespace-nowrap tabular-nums",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.className
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-10 text-center text-muted"
              >
                No data for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
