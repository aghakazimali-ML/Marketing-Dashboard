"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useDateRange } from "@/components/providers/date-range-provider";
import { useFetchAll } from "@/components/providers/fetch-all-provider";
import { apiRequest } from "@/lib/client/api";
import type { DateRange } from "@/lib/metrics/periods";
import { ErrorState as ErrorStateBase, PageSkeleton } from "@/components/ui/states";

export function useRangeFetch<T>(path: string, extraParams?: Record<string, string>) {
  const { range } = useDateRange();
  const { dataVersion } = useFetchAll();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const extraKey = JSON.stringify(extraParams);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const json = await apiRequest<T>(`${path}?${buildQuery(range, extraParams)}`);
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- extraParams is serialized in extraKey
  }, [path, range, dataVersion, extraKey, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, loading, error, range, retry };
}

function buildQuery(range: DateRange, extra?: Record<string, string>) {
  return new URLSearchParams({
    preset: range.preset,
    from: format(range.start, "yyyy-MM-dd"),
    to: format(range.end, "yyyy-MM-dd"),
    ...extra,
  }).toString();
}

/** Back-compat wrappers: skeleton loader and retryable error. */
export function LoadingState() {
  return <PageSkeleton />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <ErrorStateBase message={message} onRetry={onRetry} />;
}
