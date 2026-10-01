"use client";

import { FormEvent, useEffect, useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { useDateRange } from "@/components/providers/date-range-provider";
import { SectionCard } from "@/components/ui/section-card";

type AiProvider = "OPENAI" | "ANTHROPIC" | "XAI" | "GOOGLE";
type AiSettings = { configured: boolean; provider: AiProvider; model: string };
type Insight = {
  title: string;
  observation: string;
  recommendation: string;
  priority: "high" | "medium" | "low";
};
type InsightResult = {
  summary: string;
  insights: Insight[];
  period: string;
  generatedAt: string;
};

const AI_PROVIDERS: { value: AiProvider; label: string; defaultModel: string }[] = [
  { value: "OPENAI", label: "OpenAI", defaultModel: "gpt-4o-mini" },
  { value: "ANTHROPIC", label: "Claude", defaultModel: "claude-3-5-haiku-latest" },
  { value: "XAI", label: "Grok", defaultModel: "grok-3-mini" },
  { value: "GOOGLE", label: "Gemini", defaultModel: "gemini-2.5-flash" },
];

export default function InsightsPage() {
  return (
    <AppShell
      title="AI Insights"
      subtitle="Recommendations grounded in your selected-period channel metrics"
    >
      <InsightsContent />
    </AppShell>
  );
}

function InsightsContent() {
  const user = useAuth();
  const { range } = useDateRange();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [provider, setProvider] = useState<AiProvider>("OPENAI");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<InsightResult | null>(null);

  useEffect(() => {
    fetch("/api/ai/settings")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load AI settings.");
        setSettings(data);
        setProvider(data.provider || "OPENAI");
        setModel(data.model || "gpt-4o-mini");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unable to load AI settings.");
      })
      .finally(() => setSettingsLoading(false));
  }, []);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          ...(apiKey.trim() ? { apiKey } : {}),
          ...(clearKey ? { clearApiKey: true } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save AI settings.");
      setSettings(data);
      setApiKey("");
      setClearKey(false);
      setNotice("AI settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save AI settings.");
    } finally {
      setSaving(false);
    }
  }

  async function generateInsights() {
    setGenerating(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const query = new URLSearchParams({
        preset: range.preset,
        from: format(range.start, "yyyy-MM-dd"),
        to: format(range.end, "yyyy-MM-dd"),
      });
      const response = await fetch(`/api/ai/insights?${query}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate insights.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate insights.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {user?.role === "ADMIN" ? (
        <SectionCard
          title="AI provider"
          subtitle="Choose a provider and configure its API key for this installation. The key is encrypted locally and never returned to the browser."
        >
          <form onSubmit={saveSettings} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold text-muted uppercase">Provider</span>
              <select
                value={provider}
                onChange={(event) => {
                  const nextProvider = event.target.value as AiProvider;
                  setProvider(nextProvider);
                  setModel(AI_PROVIDERS.find((item) => item.value === nextProvider)?.defaultModel ?? "");
                  setSettings(null);
                }}
                className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500"
              >
                {AI_PROVIDERS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold text-muted uppercase">Model</span>
              <input
                required
                maxLength={100}
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500"
                placeholder={AI_PROVIDERS.find((item) => item.value === provider)?.defaultModel}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold text-muted uppercase">{AI_PROVIDERS.find((item) => item.value === provider)?.label} API key</span>
              <input
                type="password"
                maxLength={500}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500"
                placeholder={settings?.configured ? "Saved key; leave blank to keep" : "Paste API key"}
                autoComplete="new-password"
              />
            </label>
            <button
              type="submit"
              disabled={saving || settingsLoading}
              className="rounded-md bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>{settingsLoading ? "Checking provider…" : settings?.configured ? `Connected · ${settings.model}` : "Not configured"}</span>
            {settings?.configured ? (
              <button
                type="button"
                onClick={() => setClearKey((value) => !value)}
                className="underline underline-offset-2 hover:text-ink"
              >
                {clearKey ? "Keep saved key" : "Remove saved key"}
              </button>
            ) : null}
            {clearKey ? <span className="text-down">The key will be removed when you save.</span> : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Generate insights"
        subtitle={`${range.label}: ${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")} · Previous: ${format(range.previousStart, "MMM d")} – ${format(range.previousEnd, "MMM d, yyyy")}`}
      >
        <p className="max-w-3xl text-sm leading-relaxed text-muted">
          The selected period’s aggregate social and website metrics are sent to {AI_PROVIDERS.find((item) => item.value === settings?.provider)?.label ?? "the selected AI provider"} when you generate insights. Post text, access tokens, and API credentials are not included. New platform data is added when an administrator runs a fetch.
        </p>
        <button
          type="button"
          onClick={() => void generateInsights()}
          disabled={generating || settingsLoading || !settings?.configured}
          className="mt-4 rounded-md bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? "Analyzing selected metrics…" : "Generate insights"}
        </button>
        {!settingsLoading && !settings?.configured ? (
          <p className="mt-3 text-sm text-muted">
            {user?.role === "ADMIN"
              ? "Choose a provider and add its API key above to enable insights."
              : "An administrator must configure the AI provider before insights are available."}
          </p>
        ) : null}
      </SectionCard>

      {error ? <p role="alert" className="text-sm text-down">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-up">{notice}</p> : null}

      {result ? (
        <div className="space-y-4">
          <SectionCard title="Executive summary" subtitle={`Generated ${format(new Date(result.generatedAt), "PPpp")} · ${result.period}`}>
            <p className="text-sm leading-relaxed text-ink">{result.summary}</p>
          </SectionCard>
          <div className="grid gap-3 lg:grid-cols-2">
            {result.insights.map((insight, index) => (
              <article key={`${insight.title}-${index}`} className="rounded-md border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-lg text-navy-900">{insight.title}</h2>
                  <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase ${insight.priority === "high" ? "bg-down/10 text-down" : insight.priority === "medium" ? "bg-teal-500/10 text-teal-700" : "bg-sand-100 text-muted"}`}>
                    {insight.priority} priority
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">{insight.observation}</p>
                <p className="mt-3 border-t border-line pt-3 text-sm leading-relaxed text-ink">
                  <span className="font-semibold">Recommended action: </span>{insight.recommendation}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}