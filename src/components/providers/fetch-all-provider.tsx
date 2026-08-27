"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type FetchAllContextValue = {
  fetching: boolean;
  lastFetchedAt: Date | null;
  lastSummary: string | null;
  dataVersion: number;
  fetchAll: () => Promise<void>;
  fetchPlatform: (platform: string) => Promise<void>;
};

const FetchAllContext = createContext<FetchAllContextValue | null>(null);

async function readJson(res: Response) {
  const text = await res.text();
  if (!text.trim()) {
    return { error: `Empty response from server (${res.status})` };
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      error: `Invalid server response (${res.status}): ${text.slice(0, 200)}`,
    };
  }
}

export function FetchAllProvider({ children }: { children: ReactNode }) {
  const [fetching, setFetching] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const run = useCallback(async (platform?: string) => {
    setFetching(true);
    setLastSummary(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(platform ? { platform } : {}),
      });
      const json = await readJson(res);
      if (!res.ok) {
        throw new Error(
          (typeof json.error === "string" && json.error) || "Fetch failed"
        );
      }
      const results = (Array.isArray(json.results) ? json.results : []) as {
        platform: string;
        status: string;
        message: string;
        mode?: string;
        error?: string;
      }[];
      const summary = results
        .map(
          (r) =>
            `${r.platform} [${r.mode ?? "?"}] ${r.status}: ${r.error || r.message}`
        )
        .join("\n");
      setLastSummary(summary || "Fetch completed.");
      setLastFetchedAt(new Date());
      setDataVersion((v) => v + 1);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Fetch failed";
      setLastSummary(`Error: ${message}`);
      console.error(e);
    } finally {
      setFetching(false);
    }
  }, []);

  const fetchAll = useCallback(() => run(), [run]);
  const fetchPlatform = useCallback(
    (platform: string) => run(platform),
    [run]
  );

  const value = useMemo(
    () => ({
      fetching,
      lastFetchedAt,
      lastSummary,
      dataVersion,
      fetchAll,
      fetchPlatform,
    }),
    [fetching, lastFetchedAt, lastSummary, dataVersion, fetchAll, fetchPlatform]
  );

  return (
    <FetchAllContext.Provider value={value}>{children}</FetchAllContext.Provider>
  );
}

export function useFetchAll() {
  const ctx = useContext(FetchAllContext);
  if (!ctx) throw new Error("useFetchAll must be used within FetchAllProvider");
  return ctx;
}
