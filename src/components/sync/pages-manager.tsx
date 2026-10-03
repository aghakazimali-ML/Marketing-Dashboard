"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, Plug, RefreshCw } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState, TableSkeleton } from "@/components/ui/states";
import { PlatformBadge } from "@/components/ui/platform-badge";
import { useConfirm } from "@/components/providers/confirm-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useFetchAll } from "@/components/providers/fetch-all-provider";
import { useEntitlements } from "@/components/providers/entitlements-provider";
import { ApiClientError, apiRequest } from "@/lib/client/api";
import type { ChannelConnection, ConnectionInfo } from "@/lib/sync/status";

export type ChannelRow = {
  id: string;
  platform: string;
  name: string;
  handle: string | null;
  externalId: string | null;
  pageUrl: string | null;
  notes: string | null;
  isActive: boolean;
  hasAccessToken: boolean;
  hasApiKey: boolean;
  oauthConnected: boolean;
  connectionStatus: "ACTIVE" | "NEEDS_RECONNECT";
};

const PLATFORMS = [
  { value: "LINKEDIN", label: "LinkedIn", provider: "linkedin", idLabel: "Organization ID", idHint: "Numeric org ID or urn:li:organization:…", tokenLabel: "Access token", tokenHint: "OAuth token with organization analytics access", showApiKey: false },
  { value: "FACEBOOK", label: "Facebook", provider: "meta", idLabel: "Page ID", idHint: "Facebook Page ID from Meta Business Suite", tokenLabel: "Page access token", tokenHint: "Meta Graph API page access token", showApiKey: false },
  { value: "INSTAGRAM", label: "Instagram", provider: "meta", idLabel: "Business Account ID", idHint: "Instagram Business / Creator account ID", tokenLabel: "Access token", tokenHint: "Meta token with instagram_basic + instagram_manage_insights", showApiKey: false },
  { value: "YOUTUBE", label: "YouTube", provider: "google", idLabel: "Channel ID", idHint: "YouTube channel ID (starts with UC…)", tokenLabel: "OAuth access token", tokenHint: "Needed for views, watch time and subscriber gains. An API key alone only returns the subscriber count.", showApiKey: true },
  { value: "WEBSITE", label: "Website (GA4)", provider: "google", idLabel: "GA4 Property ID", idHint: "Numeric GA4 property ID (e.g. 123456789)", tokenLabel: "Service-account JSON or access token", tokenHint: "Paste the service-account key JSON (recommended: tokens are minted automatically) or a short-lived bearer token.", showApiKey: false },
] as const;
type PlatformValue = (typeof PLATFORMS)[number]["value"];

const emptyForm = { platform: "LINKEDIN" as PlatformValue, name: "", handle: "", externalId: "", pageUrl: "", accessToken: "", apiKey: "", notes: "" };

const STATE_META = {
  CONNECTED: { label: "Connected", icon: CheckCircle2, cls: "bg-up/10 text-up" },
  NEEDS_RECONNECT: { label: "Needs reconnect", icon: AlertTriangle, cls: "bg-warn/15 text-warn" },
  NOT_CONFIGURED: { label: "Not configured", icon: CircleDashed, cls: "bg-sand-100 text-muted" },
} as const;

export function PagesManager() {
  const confirm = useConfirm();
  const toast = useToast();
  const { fetchChannel, fetching, dataVersion } = useFetchAll();
  const { data: ent, reload: reloadEntitlements } = useEntitlements();
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const meta = useMemo(() => PLATFORMS.find((p) => p.value === form.platform)!, [form.platform]);
  const stateById = useMemo(() => {
    const m = new Map<string, ChannelConnection>();
    for (const c of connections) for (const ch of c.channels) m.set(ch.id, ch);
    return m;
  }, [connections]);
  const oauthAvailable = useMemo(() => new Map(connections.map((c) => [c.platform, c.oauthAvailable])), [connections]);

  const load = useCallback(async () => {
    try {
      const [ch, sync] = await Promise.all([
        apiRequest<{ channels: ChannelRow[] }>("/api/channels"),
        apiRequest<{ connections: ConnectionInfo[] }>("/api/sync"),
      ]);
      setChannels(ch.channels ?? []);
      setConnections(sync.connections ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load channels.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data / syncs external state on mount
    void load();
  }, [load, dataVersion]);

  // Surface the result of an OAuth round trip (?connected=… / ?oauth_error=…).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("connected")) toast.push({ kind: "success", title: "Connected", body: "Authorization saved. Run a fetch to load data." });
    const err = sp.get("oauth_error");
    if (err) toast.push({ kind: "error", title: "Could not connect", body: err === "denied" ? "Access was not granted." : "The authorization could not be completed. Please try again." });
    if (sp.get("connected") || err) window.history.replaceState(null, "", "/sync");
  }, [toast]);

  const visible = channels.filter((c) => filter === "ALL" || c.platform === filter);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
    setShowAdvanced(false);
  }

  function startEdit(ch: ChannelRow) {
    setEditingId(ch.id);
    setForm({ platform: ch.platform as PlatformValue, name: ch.name, handle: ch.handle ?? "", externalId: ch.externalId ?? "", pageUrl: ch.pageUrl ?? "", accessToken: "", apiKey: "", notes: ch.notes ?? "" });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        platform: form.platform,
        name: form.name,
        handle: form.handle,
        externalId: form.externalId,
        pageUrl: form.pageUrl,
        notes: form.notes,
        ...(form.accessToken.trim() ? { accessToken: form.accessToken } : {}),
        ...(form.apiKey.trim() ? { apiKey: form.apiKey } : {}),
      };
      await apiRequest("/api/channels", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      toast.push({ kind: "success", title: editingId ? `Updated “${form.name}”` : `Added “${form.name}”`, body: editingId ? undefined : "Connect it below, then fetch data." });
      resetForm();
      await load();
      void reloadEntitlements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      if (err instanceof ApiClientError && err.status === 402) void reloadEntitlements();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(ch: ChannelRow) {
    try {
      await apiRequest("/api/channels", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ch.id, isActive: !ch.isActive }) });
      await load();
      void reloadEntitlements();
    } catch (e) {
      toast.push({ kind: "error", title: "Could not update", body: e instanceof Error ? e.message : undefined });
    }
  }

  async function remove(ch: ChannelRow) {
    const ok = await confirm({
      title: `Remove “${ch.name}”?`,
      body: "This permanently deletes the channel, its stored credentials and all of its stored metrics and posts. This cannot be undone.",
      confirmLabel: "Remove channel",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/api/channels?id=${encodeURIComponent(ch.id)}`, { method: "DELETE" });
      if (editingId === ch.id) resetForm();
      toast.push({ kind: "success", title: `Removed “${ch.name}”` });
      await load();
      void reloadEntitlements();
    } catch (e) {
      toast.push({ kind: "error", title: "Could not remove", body: e instanceof Error ? e.message : undefined });
    }
  }

  const input = "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink";
  const limit = ent?.plan.limits.channels ?? null;

  return (
    <SectionCard
      title="Manage pages & connections"
      subtitle="Add each channel, then connect it with one click, or paste credentials under Advanced."
      action={
        <Link href="/help/api-access" className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline">
          Setup guide <ExternalLink size={12} aria-hidden="true" />
        </Link>
      }
    >
      {limit !== null ? (
        <p className="mb-3 text-xs text-muted">
          {ent?.usage.channels ?? 0} of {limit} channels used on the {ent?.plan.name} plan.{" "}
          {(ent?.usage.channels ?? 0) >= limit ? <Link href="/billing" className="font-medium text-teal-600 underline">Upgrade for more</Link> : null}
        </p>
      ) : null}

      <form onSubmit={submit} className="mb-6 space-y-4 rounded-lg border border-line bg-sand-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-navy-900">{editingId ? "Edit page" : "Add a new page"}</h3>
          {editingId ? (
            <button type="button" onClick={resetForm} className="text-xs font-medium text-muted hover:text-navy-900">Cancel edit</button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field id="f-platform" label="Platform">
            <select id="f-platform" value={form.platform} disabled={Boolean(editingId)} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as PlatformValue }))} className={input}>
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field id="f-name" label="Display name *" hint="Shown in tables & Battleboard">
            <input id="f-name" required maxLength={120} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Main brand or channel name" className={input} />
          </Field>
          <Field id="f-handle" label="Handle / username" hint="Optional public handle">
            <input id="f-handle" maxLength={80} value={form.handle} onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))} placeholder="public-handle" className={input} />
          </Field>
          <Field id="f-id" label={meta.idLabel} hint={meta.idHint}>
            <input id="f-id" value={form.externalId} onChange={(e) => setForm((f) => ({ ...f, externalId: e.target.value }))} placeholder={meta.idHint} className={`${input} font-mono text-xs`} />
          </Field>
          <Field id="f-url" label="Page URL" hint="Optional link for your team">
            <input id="f-url" value={form.pageUrl} onChange={(e) => setForm((f) => ({ ...f, pageUrl: e.target.value }))} placeholder="https://…" className={input} />
          </Field>
          <Field id="f-notes" label="Notes" hint="Owner, brand, anything useful">
            <input id="f-notes" maxLength={2000} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={input} />
          </Field>
        </div>

        <div>
          <button type="button" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced} className="text-xs font-medium text-teal-600 hover:underline">
            {showAdvanced ? "Hide advanced (manual credentials)" : "Advanced: enter credentials manually"}
          </button>
          {showAdvanced ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field id="f-token" label={meta.tokenLabel} hint={editingId ? "Leave blank to keep the existing credential" : meta.tokenHint}>
                {form.platform === "WEBSITE" ? (
                  <textarea id="f-token" rows={4} autoComplete="off" spellCheck={false} value={form.accessToken} onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))} placeholder={editingId ? "•••• (unchanged if empty)" : '{"type":"service_account", …}'} className={`${input} font-mono text-xs`} />
                ) : (
                  <input id="f-token" type="password" autoComplete="off" value={form.accessToken} onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))} placeholder={editingId ? "•••• (unchanged if empty)" : "Paste token"} className={`${input} font-mono text-xs`} />
                )}
              </Field>
              {meta.showApiKey ? (
                <Field id="f-key" label="API key" hint={editingId ? "Leave blank to keep the existing key" : "YouTube Data API key"}>
                  <input id="f-key" type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} placeholder={editingId ? "•••• (unchanged if empty)" : "AIza…"} className={`${input} font-mono text-xs`} />
                </Field>
              ) : null}
            </div>
          ) : null}
        </div>

        {error ? <p role="alert" className="text-sm text-down">{error}</p> : null}
        <button type="submit" disabled={saving} className="rounded-md bg-navy-900 px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-50">
          {saving ? "Saving…" : editingId ? "Save changes" : `Add ${meta.label} page`}
        </button>
      </form>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter by platform">
        <Chip active={filter === "ALL"} onClick={() => setFilter("ALL")} label={`All (${channels.length})`} />
        {PLATFORMS.map((p) => (
          <Chip key={p.value} active={filter === p.value} onClick={() => setFilter(p.value)} label={`${p.label} (${channels.filter((c) => c.platform === p.value).length})`} />
        ))}
      </div>

      {loading ? (
        <TableSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState title="No pages yet" body="Use the form above to add a LinkedIn page, Facebook page, Instagram account, YouTube channel or GA4 property." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Connected pages</caption>
            <thead className="table-head text-left">
              <tr>
                {["Page", "Connection", "Last success", "Status", ""].map((h) => (
                  <th key={h || "actions"} scope="col" className="px-3 py-3 text-[11px] font-semibold tracking-wide text-muted uppercase whitespace-nowrap">{h || <span className="sr-only">Actions</span>}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((ch) => {
                const conn = stateById.get(ch.id);
                const state = conn?.state ?? "NOT_CONFIGURED";
                const M = STATE_META[state];
                const Icon = M.icon;
                const platformMeta = PLATFORMS.find((p) => p.value === ch.platform);
                const canOauth = oauthAvailable.get(ch.platform as ConnectionInfo["platform"]);
                const expiring = conn?.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
                return (
                  <tr key={ch.id} className="border-t border-line/80 align-top">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <PlatformBadge platform={ch.platform} />
                        <span className="font-medium text-navy-900">{ch.name}</span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted">{ch.externalId || "no ID yet"}</p>
                      {ch.pageUrl ? <a href={ch.pageUrl} target="_blank" rel="noreferrer noopener" className="text-xs text-teal-600 hover:underline">Open page</a> : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className={clsx("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold", M.cls)}>
                        <Icon size={12} aria-hidden="true" /> {M.label}
                      </span>
                      <p className="mt-1 text-xs text-muted">
                        {conn?.authMethod === "oauth" ? "Authorized via OAuth" : conn?.authMethod === "service_account" ? "Service account" : conn?.authMethod === "api_key" ? "API key" : conn?.authMethod === "env" ? "Server credential" : conn?.authMethod === "manual" ? "Manual token" : "No credential"}
                      </p>
                      {expiring ? <p className="text-xs text-muted">Token expires {format(expiring, "MMM d, yyyy")}</p> : null}
                      {conn?.lastError && state !== "CONNECTED" ? <p className="mt-1 max-w-[16rem] text-xs text-warn">{conn.lastError}</p> : null}
                      {platformMeta && canOauth ? (
                        <a
                          href={`/api/oauth/${platformMeta.provider}/start?channelId=${encodeURIComponent(ch.id)}`}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium hover:bg-sand-100"
                        >
                          <Plug size={12} aria-hidden="true" /> {state === "NEEDS_RECONNECT" || ch.oauthConnected ? "Reconnect" : "Connect"} with {platformMeta.provider === "google" ? "Google" : platformMeta.provider === "meta" ? "Meta" : "LinkedIn"}
                        </a>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">
                      {conn?.lastSuccessAt ? <span title={format(new Date(conn.lastSuccessAt), "PPpp")}>{formatDistanceToNow(new Date(conn.lastSuccessAt), { addSuffix: true })}</span> : "Never"}
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => void toggleActive(ch)} aria-pressed={ch.isActive} className={clsx("rounded px-2 py-0.5 text-[11px] font-semibold", ch.isActive ? "bg-up/10 text-up" : "bg-sand-100 text-muted")}>
                        {ch.isActive ? "Active" : "Paused"}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <button type="button" disabled={fetching || state === "NOT_CONFIGURED"} onClick={() => void fetchChannel(ch.platform, ch.id)} className="mr-3 inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline disabled:opacity-40 disabled:no-underline">
                        <RefreshCw size={12} aria-hidden="true" /> Fetch now
                      </button>
                      <button type="button" onClick={() => startEdit(ch)} className="mr-3 text-xs font-medium text-teal-600 hover:underline">Edit</button>
                      <button type="button" onClick={() => void remove(ch)} className="text-xs font-medium text-down hover:underline">Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="block text-sm">
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</label>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-muted">{hint}</span> : null}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={clsx("rounded-md px-3 py-1.5 text-xs font-medium", active ? "bg-navy-900 text-on-accent" : "border border-line bg-card text-navy-900 hover:bg-sand-100")}>
      {label}
    </button>
  );
}
