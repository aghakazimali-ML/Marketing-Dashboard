"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/client/api";
import { useToast } from "@/components/providers/toast-provider";
import { useAuth } from "@/components/providers/auth-provider";

type ChannelOutcome = { name: string; ok: boolean; skipped?: boolean; message: string };
type PlatformResult = {
  platform: string;
  status: string;
  message: string;
  error?: string;
  channels?: ChannelOutcome[];
};

type FetchAllContextValue = {
  fetching: boolean;
  /** Time of the latest successful fetch recorded on the server (any user, any trigger). */
  lastUpdatedAt: Date | null;
  lastSummary: string | null;
  dataVersion: number;
  fetchAll: () => Promise<void>;
  fetchPlatform: (platform: string) => Promise<void>;
  fetchChannel: (platform: string, channelId: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
};

const FetchAllContext = createContext<FetchAllContextValue | null>(null);

export function summarizeResults(results: PlatformResult[]) {
  const lines = results.map((r) => {
    const failed = (r.channels ?? []).filter((c) => !c.ok && !c.skipped);
    const detail = failed.length ? ` — ${failed.map((c) => c.message).join("; ")}` : "";
    return `${r.platform}: ${r.status.toLowerCase()}${r.status === "SUCCESS" ? "" : ` (${r.error || r.message})`}${r.status === "SUCCESS" ? detail : ""}`;
  });
  const ok = results.filter((r) => r.status === "SUCCESS").length;
  const failed = results.filter((r) => r.status === "FAILED").length;
  return { lines, ok, failed };
}

export function FetchAllProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const user = useAuth();
  const [fetching, setFetching] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const refreshStatus = useCallback(async () => {
    try {
      const json = await apiRequest<{ lastSuccessAt?: string | null }>("/api/sync", { redirectOn401: false });
      setLastUpdatedAt(json.lastSuccessAt ? new Date(json.lastSuccessAt) : null);
    } catch {
      /* status is informational */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data / syncs external state on mount
    if (user) void refreshStatus();
  }, [user, refreshStatus]);

  const run = useCallback(
    async (body: { platform?: string; channelId?: string }) => {
      setFetching(true);
      setLastSummary(null);
      try {
        const json = await apiRequest<{ results?: PlatformResult[] }>("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const results = json.results ?? [];
        const { lines, ok, failed } = summarizeResults(results);
        setLastSummary(lines.join("\n") || "Fetch completed.");
        toast.push({
          kind: failed ? "error" : ok ? "success" : "info",
          title: failed ? `${ok} succeeded, ${failed} failed` : ok ? "Data fetched" : "Nothing to fetch",
          body: lines.join("\n"),
        });
        setDataVersion((v) => v + 1);
        await refreshStatus();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Fetch failed";
        setLastSummary(`Error: ${message}`);
        toast.push({ kind: "error", title: "Fetch failed", body: message });
      } finally {
        setFetching(false);
      }
    },
    [toast, refreshStatus]
  );

  const value = useMemo<FetchAllContextValue>(
    () => ({
      fetching,
      lastUpdatedAt,
      lastSummary,
      dataVersion,
      fetchAll: () => run({}),
      fetchPlatform: (platform) => run({ platform }),
      fetchChannel: (platform, channelId) => run({ platform, channelId }),
      refreshStatus,
    }),
    [fetching, lastUpdatedAt, lastSummary, dataVersion, run, refreshStatus]
  );

  return <FetchAllContext.Provider value={value}>{children}</FetchAllContext.Provider>;
}

export function useFetchAll() {
  const ctx = useContext(FetchAllContext);
  if (!ctx) throw new Error("useFetchAll must be used within FetchAllProvider");
  return ctx;
}
