"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { PagesManager } from "@/components/sync/pages-manager";
import { useFetchAll } from "@/components/providers/fetch-all-provider";
import { format } from "date-fns";
import clsx from "clsx";
import { useAuth } from "@/components/providers/auth-provider";

type SyncRun = {
  id: string;
  platform: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  error: string | null;
  recordsUpserted: number;
};

type Connection = {
  platform: string;
  label: string;
  connected: boolean;
  mode: "live" | "unconfigured";
  hint: string;
  envKeys: string[];
  pageCount?: number;
  pagesWithCredentials?: number;
};

export default function SyncPage() {
  return (
    <AppShell
      title="Fetch & Connections"
      subtitle="Add your pages and API tokens, then fetch live data into the dashboard"
    >
      <SyncContent />
    </AppShell>
  );
}

function SyncContent() {
  const user = useAuth();
  const { fetching, fetchAll, fetchPlatform, lastSummary, lastFetchedAt } =
    useFetchAll();
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sync");
      const json = await res.json();
      setRuns(json.runs ?? []);
      setConnections(json.connections ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, lastFetchedAt]);

  const liveCount = connections.filter((c) => c.connected).length;

  return (
    <div className="space-y-6">
      {user?.role === "ADMIN" ? (
        <PagesManager />
      ) : (
        <SectionCard title="Connections are administrator-managed">
          <p className="text-sm text-muted">Your account can view connection status and fetch history, but cannot edit credentials or run data fetches.</p>
        </SectionCard>
      )}

      {user?.role === "ADMIN" ? (
        <SectionCard
          title="Fetch all platforms"
          subtitle="Fetch connected channels and refresh dashboard data."
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={fetching}
              onClick={() => fetchAll()}
              className="rounded-md bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
            >
              {fetching ? "Fetching all platforms…" : "Fetch All Data"}
            </button>
            {connections.map((c) => (
              <button
                key={c.platform}
                type="button"
                disabled={fetching}
                onClick={() => fetchPlatform(c.platform)}
                className="rounded-md border border-line bg-card px-3 py-2 text-sm font-medium hover:bg-sand-100 disabled:opacity-50"
              >
                {fetching ? "…" : `Fetch ${c.label}`}
              </button>
            ))}
          </div>
          {lastSummary && (
            <pre className="mt-4 whitespace-pre-wrap rounded-md bg-sand-100 p-3 text-xs text-ink">
              {lastSummary}
            </pre>
          )}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Connection status"
        subtitle={`${liveCount} of ${connections.length} platforms configured for live fetch`}
      >
        {loading && connections.length === 0 ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {connections.map((c) => (
              <div
                key={c.platform}
                className="rounded-lg border border-line bg-sand-50 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-navy-900">{c.label}</p>
                  <span
                    className={clsx(
                      "rounded px-2 py-0.5 text-[11px] font-semibold uppercase",
                      c.connected
                        ? "bg-up/10 text-up"
                        : "bg-sand-100 text-muted"
                    )}
                  >
                      {c.connected ? "Ready" : "Not configured"}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">{c.hint}</p>
                <p className="mt-2 text-[11px] text-navy-700">
                  Pages: {c.pageCount ?? 0} · With credentials:{" "}
                  {c.pagesWithCredentials ?? 0}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Fetch history"
        subtitle="Every fetch appends new snapshots — history is never overwritten"
      >
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-sand-100/80 text-left">
                <tr>
                  {["Started", "Platform", "Status", "Records", "Message"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-3 text-[11px] font-semibold tracking-wide text-muted uppercase"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-line/80">
                    <td className="px-3 py-3 whitespace-nowrap text-muted">
                      {format(new Date(r.startedAt), "MMM d, HH:mm")}
                    </td>
                    <td className="px-3 py-3 font-medium">{r.platform}</td>
                    <td className="px-3 py-3">
                      <span
                        className={clsx(
                          "rounded px-2 py-0.5 text-[11px] font-semibold",
                          r.status === "SUCCESS" && "bg-up/10 text-up",
                          r.status === "FAILED" && "bg-down/10 text-down",
                          r.status === "RUNNING" &&
                            "bg-teal-500/10 text-teal-600",
                          r.status === "SKIPPED" && "bg-sand-100 text-muted",
                          r.status === "PENDING" && "bg-sand-100 text-muted"
                        )}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {r.recordsUpserted}
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {r.error ? r.error : r.message}
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-8 text-center text-muted"
                    >
                      No fetches yet — add pages, then click Fetch All Data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
