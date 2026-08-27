"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useDateRange } from "@/components/providers/date-range-provider";
import { useFetchAll } from "@/components/providers/fetch-all-provider";
import type { DateRange } from "@/lib/metrics/periods";

export function useRangeFetch<T>(
  path: string,
  extraParams?: Record<string, string>
) {
  const { range } = useDateRange();
  const { dataVersion } = useFetchAll();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const q = buildQuery(range, extraParams);
        const res = await fetch(`${path}?${q}`);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- extraParams serialized
  }, [path, range, dataVersion, JSON.stringify(extraParams)]);

  return { data, loading, error, range };
}

function buildQuery(range: DateRange, extra?: Record<string, string>) {
  const q = new URLSearchParams({
    preset: range.preset,
    from: format(range.start, "yyyy-MM-dd"),
    to: format(range.end, "yyyy-MM-dd"),
    ...extra,
  });
  return q.toString();
}

export function LoadingState() {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted">
      Loading metrics…
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-down/30 bg-down/5 px-4 py-3 text-sm text-down">
      {message}
    </div>
  );
}
