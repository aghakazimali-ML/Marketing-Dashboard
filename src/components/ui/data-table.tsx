"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  /** Return null for "no value": those rows always sort last. */
  sortValue?: (row: T) => string | number | null;
  render: (row: T) => React.ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  highlightBest,
  getHighlightValue,
  caption,
  emptyMessage = "No data for this period.",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  highlightBest?: boolean;
  getHighlightValue?: (row: T) => number | null;
  /** Accessible table name. */
  caption?: string;
  emptyMessage?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    const get = col?.sortValue;
    if (!get) return rows;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [rows, sortKey, sortDir, columns]);

  const bestId = useMemo(() => {
    if (!highlightBest || !getHighlightValue) return null;
    const scored = sorted.filter((r) => getHighlightValue(r) !== null);
    if (!scored.length) return null;
    return rowKey(scored.reduce((best, r) => ((getHighlightValue(r) as number) > (getHighlightValue(best) as number) ? r : best)));
  }, [sorted, highlightBest, getHighlightValue, rowKey]);

  function onSort(col: Column<T>) {
    if (!col.sortable) return;
    if (sortKey === col.key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(col.key);
      setSortDir("desc");
    }
  }

  return (
    <div className="crazy-card overflow-x-auto rounded-xl border border-white/50">
      <table className="min-w-full text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="table-head text-left">
          <tr>
            {columns.map((col) => {
              const active = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable ? (active ? (sortDir === "desc" ? "descending" : "ascending") : "none") : undefined}
                  className={clsx(
                    "px-3 py-3 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase whitespace-nowrap",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.className
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(col)}
                      className={clsx("inline-flex items-center gap-1 uppercase hover:text-navy-900", col.align === "right" && "flex-row-reverse")}
                    >
                      {col.header}
                      {active ? (
                        sortDir === "desc" ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />
                      ) : (
                        <ChevronsUpDown size={12} aria-hidden="true" className="opacity-50" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const id = rowKey(row);
            return (
              <tr key={id} className={clsx("border-t border-line/80", bestId === id && "bg-teal-500/10")}>
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
              <td colSpan={columns.length} className="px-3 py-10 text-center text-muted">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
