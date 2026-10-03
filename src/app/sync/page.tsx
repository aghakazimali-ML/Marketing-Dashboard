"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import clsx from "clsx";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { PagesManager } from "@/components/sync/pages-manager";
import { useAuth } from "@/components/providers/auth-provider";
import { useFetchAll } from "@/components/providers/fetch-all-provider";
import { useEntitlements } from "@/components/providers/entitlements-provider";
import { apiRequest } from "@/lib/client/api";
import type { ConnectionInfo } from "@/lib/sync/status";

type SyncRun = {
  id: string;
  platform: string;
  status: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  error: string | null;
  detail?: string | null;
  recordsUpserted: number;
};

export default function SyncPage() {
  return (
    <AppShell title="Fetch & Connections" subtitle="Connect your channels, then fetch live data into the dashboard" hideRange>
      <SyncContent />
    </AppShell>
  );
}

function SyncContent() {
  const user = useAuth();
  const { has } = useEntitlements();
  const { fetching, fetchAll, fetchPlatform, lastSummary, dataVersion } = useFetchAll();
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = user?.role === "ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await apiRequest<{ runs: SyncRun[]; connections: ConnectionInfo[] }>("/api/sync");
      setRuns(json.runs ?? []);
      setConnections(json.connections ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load fetch status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data / syncs external state on mount
    void load();
  }, [load, dataVersion]);

  const liveCount = connections.filter((c) => c.connected).length;

  return (
    <div className="space-y-6">
      {isAdmin ? (
        <PagesManager />
      ) : (
        <SectionCard title="Connections are administrator-managed">
          <p className="text-sm text-muted">Your account can view connection status and fetch history, but cannot edit credentials or run data fetches.</p>
        </SectionCard>
      )}

      {isAdmin ? (
        <SectionCard title="Fetch data" subtitle="Fetch connected channels now. Re-fetching never double counts: each day is stored once and overwritten.">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={fetching} onClick={() => void fetchAll()} className="rounded-md bg-teal-600 px-5 py-2.5 text-sm font-semibold text-on-accent hover:bg-teal-500 disabled:opacity-50">
              {fetching ? "Fetching all platforms…" : "Fetch All Data"}
            </button>
            {connections.map((c) => (
              <button key={c.platform} type="button" disabled={fetching || c.pageCount === 0} onClick={() => void fetchPlatform(c.platform)} className="rounded-md border border-line bg-card px-3 py-2 text-sm font-medium hover:bg-sand-100 disabled:opacity-50">
                Fetch {c.label}
              </button>
            ))}
          </div>
          {lastSummary ? <pre aria-live="polite" className="mt-4 whitespace-pre-wrap rounded-md bg-sand-100 p-3 text-xs text-ink">{lastSummary}</pre> : null}
          <div className="mt-5 rounded-md border border-line bg-sand-50 p-3 text-xs text-muted">
            <p className="font-semibold text-navy-900">Automatic daily fetch {has("scheduledFetch") ? "" : "(Starter plan and above)"}</p>
            <p className="mt-1">Call this once a day from cron or your scheduler (keep <code>CRON_SECRET</code> private):</p>
            <pre className="mt-2 overflow-x-auto rounded bg-surface p-2 font-mono text-[11px] text-ink">{`curl -X POST -H "x-cron-secret: $CRON_SECRET" $APP_BASE_URL/api/cron/sync`}</pre>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Connection status" subtitle={`${liveCount} of ${connections.length} platforms ready to fetch`}>
        {loading && !connections.length ? (
          <TableSkeleton rows={3} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {connections.map((c) => (
              <div key={c.platform} className="rounded-lg border border-line bg-sand-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-navy-900">{c.label}</p>
                  <span className={clsx("rounded px-2 py-0.5 text-[11px] font-semibold uppercase", c.needsReconnect ? "bg-warn/15 text-warn" : c.connected ? "bg-up/10 text-up" : "bg-sand-100 text-muted")}>
                    {c.needsReconnect ? "Needs reconnect" : c.connected ? "Ready" : "Not configured"}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">{c.hint}</p>
                <p className="mt-2 text-[11px] text-navy-700">Pages: {c.pageCount} · Ready: {c.channels.filter((x) => x.state === "CONNECTED").length}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Fetch history" subtitle="Every run is recorded. Admins can expand a run for technical detail.">
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {loading && !runs.length ? (
          <TableSkeleton />
        ) : runs.length === 0 ? (
          <EmptyState title="No fetches yet" body="Add a channel, connect it, then click Fetch All Data." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <caption className="sr-only">Recent fetch runs</caption>
              <thead className="table-head text-left">
                <tr>
                  {["Started", "Platform", "Trigger", "Status", "Records", "Message"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-3 text-[11px] font-semibold tracking-wide text-muted uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-line/80 align-top">
                    <td className="px-3 py-3 whitespace-nowrap text-muted">{format(new Date(r.startedAt), "MMM d, HH:mm")}</td>
                    <td className="px-3 py-3 font-medium">{r.platform}</td>
                    <td className="px-3 py-3 text-xs text-muted capitalize">{r.trigger}</td>
                    <td className="px-3 py-3">
                      <span className={clsx("rounded px-2 py-0.5 text-[11px] font-semibold", r.status === "SUCCESS" && "bg-up/10 text-up", r.status === "FAILED" && "bg-down/10 text-down", r.status === "RUNNING" && "bg-teal-500/10 text-teal-600", (r.status === "SKIPPED" || r.status === "PENDING") && "bg-sand-100 text-muted")}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{r.recordsUpserted}</td>
                    <td className="px-3 py-3 text-muted">
                      {r.error ?? r.message}
                      {isAdmin && r.detail ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-teal-600">Details</summary>
                          <pre className="mt-1 max-w-md whitespace-pre-wrap text-[11px]">{r.detail}</pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
