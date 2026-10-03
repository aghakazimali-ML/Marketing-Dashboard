"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, XCircle } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import { useEntitlements } from "@/components/providers/entitlements-provider";
import { apiRequest } from "@/lib/client/api";

type Entry = { id: string; createdAt: string; actor: string | null; role: string | null; action: string; target: string | null; success: boolean; ip: string | null };

/** Admin-only audit trail: logins, invites, role changes, credential and billing changes, fetches. */
export function AuditLog() {
  const { has } = useEntitlements();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const allowed = has("auditLog");

  const load = useCallback(async (after?: string | null) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: "25" });
      if (after) q.set("cursor", after);
      const r = await apiRequest<{ entries: Entry[]; nextCursor: string | null }>(`/api/audit?${q}`);
      setEntries((prev) => (after ? [...prev, ...r.entries] : r.entries));
      setCursor(r.nextCursor);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the audit log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data / syncs external state on mount
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) {
    return (
      <SectionCard title="Audit log">
        <UpgradePrompt feature="auditLog" description="See who signed in, changed roles, edited credentials or ran fetches. Included from the Pro plan (events are recorded on every plan)." />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Audit log" subtitle="Security-relevant events, newest first">
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && !entries.length ? (
        <TableSkeleton />
      ) : entries.length === 0 ? (
        <EmptyState title="No events yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Audit log</caption>
            <thead className="table-head text-left">
              <tr>
                {["When", "Who", "Action", "Target", "Result", "IP"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-3 text-[11px] font-semibold text-muted uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-line/80 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-muted">{format(new Date(e.createdAt), "MMM d, HH:mm:ss")}</td>
                  <td className="px-3 py-2">{e.actor ?? "—"}{e.role ? <span className="ml-1 text-xs text-muted">({e.role.toLowerCase()})</span> : null}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2 text-muted" title={e.target ?? undefined}>{e.target ?? "—"}</td>
                  <td className="px-3 py-2">
                    {e.success ? <span className="inline-flex items-center gap-1 text-up"><CheckCircle2 size={13} aria-hidden="true" /> OK</span> : <span className="inline-flex items-center gap-1 text-down"><XCircle size={13} aria-hidden="true" /> Failed</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">{e.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor ? (
        <button type="button" disabled={loading} onClick={() => void load(cursor)} className="mt-3 rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:bg-sand-100 disabled:opacity-50">
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </SectionCard>
  );
}
