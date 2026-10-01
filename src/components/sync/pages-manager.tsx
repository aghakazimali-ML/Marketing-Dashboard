"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import clsx from "clsx";

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
  accessTokenMasked: string | null;
  apiKeyMasked: string | null;
};

const PLATFORMS = [
  {
    value: "LINKEDIN",
    label: "LinkedIn",
    idLabel: "Organization ID",
    idHint: "Numeric org ID or urn:li:organization:…",
    tokenLabel: "Access Token",
    tokenHint: "OAuth token with org page analytics access",
    showApiKey: false,
  },
  {
    value: "FACEBOOK",
    label: "Facebook",
    idLabel: "Page ID",
    idHint: "Facebook Page ID from Meta Business Suite",
    tokenLabel: "Page Access Token",
    tokenHint: "Meta Graph API page access token",
    showApiKey: false,
  },
  {
    value: "INSTAGRAM",
    label: "Instagram",
    idLabel: "Business Account ID",
    idHint: "Instagram Business / Creator account ID",
    tokenLabel: "Access Token",
    tokenHint: "Meta token with instagram_basic + insights",
    showApiKey: false,
  },
  {
    value: "YOUTUBE",
    label: "YouTube",
    idLabel: "Channel ID",
    idHint: "YouTube channel ID (starts with UC…)",
    tokenLabel: "OAuth token (optional)",
    tokenHint: "Optional — API Key alone is enough for public stats",
    showApiKey: true,
  },
  {
    value: "WEBSITE",
    label: "Website (GA4)",
    idLabel: "GA4 Property ID",
    idHint: "Numeric GA4 property ID (e.g. 123456789)",
    tokenLabel: "Access Token",
    tokenHint: "Google OAuth / service-account bearer token",
    showApiKey: false,
  },
] as const;

type PlatformValue = (typeof PLATFORMS)[number]["value"];

const emptyForm = {
  platform: "LINKEDIN" as PlatformValue,
  name: "",
  handle: "",
  externalId: "",
  pageUrl: "",
  accessToken: "",
  apiKey: "",
  notes: "",
};

export function PagesManager() {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState<string>("ALL");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const meta = useMemo(
    () => PLATFORMS.find((p) => p.value === form.platform)!,
    [form.platform]
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/channels");
    const json = await res.json();
    setChannels(json.channels ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const visible = channels.filter(
    (c) => filter === "ALL" || c.platform === filter
  );

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
  }

  function startEdit(ch: ChannelRow) {
    setEditingId(ch.id);
    setForm({
      platform: ch.platform as PlatformValue,
      name: ch.name,
      handle: ch.handle ?? "",
      externalId: ch.externalId ?? "",
      pageUrl: ch.pageUrl ?? "",
      accessToken: "",
      apiKey: "",
      notes: ch.notes ?? "",
    });
    setError(null);
    setOk(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOk(null);
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

      const res = await fetch("/api/channels", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId ? { id: editingId, ...payload } : payload
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setOk(
        editingId
          ? `Updated “${form.name}”`
          : `Added “${form.name}” — you can Fetch All Data now`
      );
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(ch: ChannelRow) {
    await fetch("/api/channels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ch.id, isActive: !ch.isActive }),
    });
    await load();
  }

  async function remove(ch: ChannelRow) {
    if (!confirm(`Remove “${ch.name}” and its stored metrics?`)) return;
    await fetch(`/api/channels?id=${ch.id}`, { method: "DELETE" });
    if (editingId === ch.id) resetForm();
    await load();
  }

  return (
    <SectionCard
      title="Manage pages & API credentials"
      subtitle="Add each LinkedIn / Facebook / Instagram / YouTube / GA4 property yourself — name, IDs, tokens, and notes. Fetch uses these when you click Fetch All Data."
    >
      <form
        onSubmit={submit}
        className="mb-6 space-y-4 rounded-lg border border-line bg-sand-50 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-navy-900">
            {editingId ? "Edit page" : "Add a new page"}
          </p>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-medium text-muted hover:text-navy-900"
            >
              Cancel edit
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Platform">
            <select
              value={form.platform}
              disabled={Boolean(editingId)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  platform: e.target.value as PlatformValue,
                }))
              }
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-teal-500"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Display name *" hint="Shown in tables & Battleboard">
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Main brand or channel name"
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-teal-500"
            />
          </Field>

          <Field label="Handle / username" hint="Optional public handle">
            <input
              value={form.handle}
              onChange={(e) =>
                setForm((f) => ({ ...f, handle: e.target.value }))
              }
              placeholder="public-handle"
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-teal-500"
            />
          </Field>

          <Field label={`${meta.idLabel}`} hint={meta.idHint}>
            <input
              value={form.externalId}
              onChange={(e) =>
                setForm((f) => ({ ...f, externalId: e.target.value }))
              }
              placeholder={meta.idHint}
              className="w-full rounded-md border border-line bg-card px-3 py-2 font-mono text-xs outline-none focus:border-teal-500"
            />
          </Field>

          <Field label="Page URL" hint="Optional link for your team">
            <input
              value={form.pageUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, pageUrl: e.target.value }))
              }
              placeholder="https://www.linkedin.com/company/…"
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-teal-500"
            />
          </Field>

          <Field
            label={meta.tokenLabel}
            hint={
              editingId
                ? "Leave blank to keep the existing token"
                : meta.tokenHint
            }
          >
            <input
              type="password"
              autoComplete="off"
              value={form.accessToken}
              onChange={(e) =>
                setForm((f) => ({ ...f, accessToken: e.target.value }))
              }
              placeholder={editingId ? "•••• (unchanged if empty)" : "Paste token"}
              className="w-full rounded-md border border-line bg-card px-3 py-2 font-mono text-xs outline-none focus:border-teal-500"
            />
          </Field>

          {meta.showApiKey ? (
            <Field
              label="API Key"
              hint={
                editingId
                  ? "Leave blank to keep existing key"
                  : "YouTube Data API key"
              }
            >
              <input
                type="password"
                autoComplete="off"
                value={form.apiKey}
                onChange={(e) =>
                  setForm((f) => ({ ...f, apiKey: e.target.value }))
                }
                placeholder={editingId ? "•••• (unchanged if empty)" : "AIza…"}
                className="w-full rounded-md border border-line bg-card px-3 py-2 font-mono text-xs outline-none focus:border-teal-500"
              />
            </Field>
          ) : null}

          <Field
            label="Notes"
            hint="Owner, brand, or anything useful for the team"
            className="md:col-span-2 xl:col-span-3"
          >
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={2}
              placeholder="e.g. Primary corporate page — managed by Marketing"
              className="w-full resize-y rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-teal-500"
            />
          </Field>
        </div>

        {error ? <p className="text-sm text-down">{error}</p> : null}
        {ok ? <p className="text-sm text-up">{ok}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : editingId
              ? "Save changes"
              : `Add ${meta.label} page`}
        </button>
      </form>

      <div className="mb-3 flex flex-wrap gap-2">
        <FilterChip
          active={filter === "ALL"}
          onClick={() => setFilter("ALL")}
          label={`All (${channels.length})`}
        />
        {PLATFORMS.map((p) => {
          const n = channels.filter((c) => c.platform === p.value).length;
          return (
            <FilterChip
              key={p.value}
              active={filter === p.value}
              onClick={() => setFilter(p.value)}
              label={`${p.label} (${n})`}
            />
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-sand-100/80 text-left">
            <tr>
              {[
                "Platform",
                "Name",
                "Page / Org ID",
                "Credentials",
                "Status",
                "Notes",
                "",
              ].map((h) => (
                <th
                  key={h || "actions"}
                  className="px-3 py-3 text-[11px] font-semibold tracking-wide text-muted uppercase whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((ch) => {
              const isReady =
                Boolean(ch.externalId) &&
                (ch.platform === "YOUTUBE"
                  ? ch.hasApiKey || ch.hasAccessToken
                  : ch.hasAccessToken);
              return (
                <tr key={ch.id} className="border-t border-line/80 align-top">
                  <td className="px-3 py-3">
                    <span className="rounded bg-navy-900/8 px-2 py-0.5 text-[11px] font-semibold text-navy-900">
                      {ch.platform}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-navy-900">{ch.name}</p>
                    {ch.handle ? (
                      <p className="text-xs text-muted">@{ch.handle}</p>
                    ) : null}
                    {ch.pageUrl ? (
                      <a
                        href={ch.pageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-teal-600 hover:underline"
                      >
                        Open page
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-muted">
                    {ch.externalId || "—"}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <p>
                      Token:{" "}
                      {ch.hasAccessToken ? (
                        <span className="text-up">{ch.accessTokenMasked}</span>
                      ) : (
                        <span className="text-muted">not set</span>
                      )}
                    </p>
                    {ch.platform === "YOUTUBE" ? (
                      <p>
                        API key:{" "}
                        {ch.hasApiKey ? (
                          <span className="text-up">{ch.apiKeyMasked}</span>
                        ) : (
                          <span className="text-muted">not set</span>
                        )}
                      </p>
                    ) : null}
                    <p
                      className={clsx(
                        "mt-1 font-medium",
                        isReady ? "text-up" : "text-muted"
                      )}
                    >
                      {isReady ? "Ready for live fetch" : "Needs ID + token"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => toggleActive(ch)}
                      className={clsx(
                        "rounded px-2 py-0.5 text-[11px] font-semibold",
                        ch.isActive
                          ? "bg-up/10 text-up"
                          : "bg-sand-100 text-muted"
                      )}
                    >
                      {ch.isActive ? "Active" : "Paused"}
                    </button>
                  </td>
                  <td className="max-w-[200px] px-3 py-3 text-xs text-muted">
                    {ch.notes || "—"}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(ch)}
                      className="mr-3 text-xs font-medium text-teal-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(ch)}
                      className="text-xs font-medium text-down hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted">
                  No pages yet — use the form above to add LinkedIn company
                  pages, Facebook pages, Instagram, YouTube, or GA4.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("block text-sm", className)}>
      <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-md px-3 py-1.5 text-xs font-medium",
        active
          ? "bg-navy-900 text-white"
          : "border border-line bg-card text-navy-900 hover:bg-sand-100"
      )}
    >
      {label}
    </button>
  );
}
