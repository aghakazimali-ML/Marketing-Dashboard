"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Copy, KeyRound, Lock } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { useEntitlements } from "@/components/providers/entitlements-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import { useToast } from "@/components/providers/toast-provider";
import { apiRequest } from "@/lib/client/api";

type Settings = { brandName: string | null; effectiveBrandName: string; reportFrequency: "NONE" | "WEEKLY" | "MONTHLY"; reportRecipients: string[]; lastReportAt: string | null };
type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

function Locked({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      <Lock size={14} aria-hidden="true" /> {text} <Link href="#plans" className="font-medium text-teal-600 underline">See plans</Link>
    </p>
  );
}

/** Branding, scheduled reports and API keys: plan-gated workspace settings (admins only). */
export function WorkspaceSettings() {
  const { has, reload } = useEntitlements();
  const toast = useToast();
  const confirm = useConfirm();
  const [s, setS] = useState<Settings | null>(null);
  const [brand, setBrand] = useState("");
  const [frequency, setFrequency] = useState<Settings["reportFrequency"]>("NONE");
  const [recipients, setRecipients] = useState("");
  const [keys, setKeys] = useState<Key[]>([]);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const st = await apiRequest<Settings>("/api/settings/workspace");
      setS(st);
      setBrand(st.brandName ?? "");
      setFrequency(st.reportFrequency);
      setRecipients(st.reportRecipients.join(", "));
    } catch {
      /* shown as empty */
    }
    if (has("apiAccess")) {
      try {
        setKeys((await apiRequest<{ keys: Key[] }>("/api/keys")).keys);
      } catch {
        setKeys([]);
      }
    }
  }, [has]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data / syncs external state on mount
    void load();
  }, [load]);

  async function save(e: FormEvent, body: object, ok: string) {
    e.preventDefault();
    try {
      await apiRequest("/api/settings/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      toast.push({ kind: "success", title: ok });
      await load();
      void reload();
    } catch (err) {
      toast.push({ kind: "error", title: "Could not save", body: err instanceof Error ? err.message : undefined });
    }
  }

  async function createKey(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await apiRequest<{ key: string }>("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: keyName }) });
      setNewKey(r.key);
      setKeyName("");
      await load();
    } catch (err) {
      toast.push({ kind: "error", title: "Could not create key", body: err instanceof Error ? err.message : undefined });
    }
  }

  async function revoke(k: Key) {
    if (!(await confirm({ title: `Revoke “${k.name}”?`, body: "Anything using this key will stop working immediately.", confirmLabel: "Revoke key", danger: true }))) return;
    await apiRequest(`/api/keys?id=${encodeURIComponent(k.id)}`, { method: "DELETE" }).catch(() => undefined);
    await load();
  }

  const input = "rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink";
  const btn = "rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-on-accent hover:bg-teal-500";

  return (
    <div id="settings" className="space-y-6">
      <SectionCard title="White-label branding" subtitle="Show your own product name in the app, reports and emails (Exclusive).">
        {has("whiteLabel") ? (
          <form onSubmit={(e) => save(e, { brandName: brand }, "Branding saved")} className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="brand" className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">Product name</label>
              <input id="brand" maxLength={60} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={s?.effectiveBrandName} className={input} />
            </div>
            <button type="submit" className={btn}>Save</button>
          </form>
        ) : (
          <Locked text="White-label branding is part of the Exclusive plan." />
        )}
      </SectionCard>

      <SectionCard title="Scheduled email reports" subtitle="A performance digest emailed to administrators and extra recipients (Pro and above).">
        {has("scheduledReports") ? (
          <form onSubmit={(e) => save(e, { reportFrequency: frequency, reportRecipients: recipients.split(",").map((x) => x.trim()).filter(Boolean) }, "Report schedule saved")} className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="freq" className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">Frequency</label>
              <select id="freq" value={frequency} onChange={(e) => setFrequency(e.target.value as Settings["reportFrequency"])} className={`${input} w-full`}>
                <option value="NONE">Off</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <div>
              <label htmlFor="recips" className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">Extra recipients (comma separated)</label>
              <input id="recips" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="ceo@example.com, team@example.com" className={`${input} w-full`} />
            </div>
            <button type="submit" className={btn}>Save</button>
            <p className="text-xs text-muted sm:col-span-3">
              Sent by a daily call to <code>/api/cron/reports</code> (same secret as the fetch). {s?.lastReportAt ? `Last sent ${format(new Date(s.lastReportAt), "MMM d, yyyy")}.` : "Nothing sent yet."}
            </p>
          </form>
        ) : (
          <Locked text="Scheduled reports are part of the Pro plan." />
        )}
      </SectionCard>

      <SectionCard title="API access" subtitle="Read-only REST API for your own dashboards and tools (Exclusive).">
        {has("apiAccess") ? (
          <div className="space-y-4">
            <form onSubmit={createKey} className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="keyname" className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">Key name</label>
                <input id="keyname" required maxLength={60} value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="BI tool" className={input} />
              </div>
              <button type="submit" className={btn}>Create key</button>
            </form>
            {newKey ? (
              <div role="status" className="rounded-md border border-up/40 bg-up/10 p-3 text-sm">
                <p className="font-semibold text-up">Copy your key now. It will not be shown again.</p>
                <div className="mt-2 flex gap-2">
                  <input readOnly aria-label="New API key" value={newKey} className="w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs" />
                  <button type="button" onClick={() => void navigator.clipboard.writeText(newKey)} className="inline-flex items-center gap-1 rounded-md border border-line px-3 text-sm"><Copy size={14} aria-hidden="true" /> Copy</button>
                </div>
              </div>
            ) : null}
            <ul className="divide-y divide-line/80">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex items-center gap-2"><KeyRound size={14} aria-hidden="true" /> <strong>{k.name}</strong> <code className="text-xs text-muted">{k.prefix}…</code></span>
                  <span className="flex items-center gap-3 text-xs text-muted">
                    {k.lastUsedAt ? `Used ${format(new Date(k.lastUsedAt), "MMM d")}` : "Never used"}
                    <button type="button" onClick={() => void revoke(k)} className="font-medium text-down hover:underline">Revoke</button>
                  </span>
                </li>
              ))}
              {keys.length === 0 ? <li className="py-2 text-sm text-muted">No active keys.</li> : null}
            </ul>
            <pre className="overflow-x-auto rounded-md bg-sand-100 p-3 text-[11px]">{`curl -H "Authorization: Bearer mdk_…" "$APP_BASE_URL/api/v1/overview?preset=last_30"\ncurl -H "Authorization: Bearer mdk_…" "$APP_BASE_URL/api/v1/channels?preset=last_30"`}</pre>
          </div>
        ) : (
          <Locked text="API access is part of the Exclusive plan." />
        )}
      </SectionCard>
    </div>
  );
}
