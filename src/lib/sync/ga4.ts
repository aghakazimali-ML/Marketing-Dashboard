import type { ChannelSyncContext, ChannelSyncResult } from "@/lib/sync/types";
import { API_VERSIONS } from "@/lib/metrics/catalog";
import { dayKey, parseDayString } from "@/lib/metrics/dates";
import { apiJson } from "@/lib/sync/http";
import {
  upsertBreakdowns,
  upsertWebsiteDays,
  type BreakdownInput,
  type WebsiteDayInput,
} from "@/lib/sync/store";

export const GA4_SOURCE = `ga4:${API_VERSIONS.GA4}`;

type Report = {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string }[];
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
};

export function reportRows(r: Report) {
  const dims = (r.dimensionHeaders ?? []).map((d) => d.name);
  const mets = (r.metricHeaders ?? []).map((m) => m.name);
  return (r.rows ?? []).map((row) => {
    const d: Record<string, string> = {};
    const m: Record<string, number> = {};
    dims.forEach((n, i) => (d[n] = row.dimensionValues[i]?.value ?? ""));
    mets.forEach((n, i) => (m[n] = Number(row.metricValues[i]?.value ?? NaN)));
    return { d, m };
  });
}

const finite = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? null : n);

export function daysFromReport(r: Report): WebsiteDayInput[] {
  const out: WebsiteDayInput[] = [];
  for (const { d, m } of reportRows(r)) {
    const date = parseDayString(d.date ?? "");
    if (!date) continue;
    out.push({
      date,
      users: finite(m.activeUsers),
      sessions: finite(m.sessions),
      newUsers: finite(m.newUsers),
      // GA4 returns bounce rate as a 0-1 fraction.
      bounceRate: m.bounceRate !== undefined && Number.isFinite(m.bounceRate) ? Number((m.bounceRate * 100).toFixed(2)) : null,
      avgSessionDurationSec: finite(m.averageSessionDuration),
      conversions: finite(m.keyEvents),
    });
  }
  return out;
}

export async function syncGA4Channel(ctx: ChannelSyncContext): Promise<ChannelSyncResult> {
  const { channel, token } = ctx;
  const propertyId = (channel.externalId?.trim() || process.env.GA4_PROPERTY_ID?.trim() || "").replace(/^properties\//, "");
  if (!token) throw new Error("missing credentials");
  if (!/^\d{1,20}$/.test(propertyId)) throw new Error("invalid GA4 property ID (use the numeric ID)");

  const url = `https://analyticsdata.googleapis.com/${API_VERSIONS.GA4}/properties/${propertyId}:runReport`;
  const run = (body: object, label: string) =>
    apiJson<Report>(
      url,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: dayKey(ctx.from), endDate: dayKey(ctx.today) }],
          limit: 10000,
          ...body,
        }),
      },
      { label, authStatuses: [403] }
    );
  const notes: string[] = [];

  const daily = await run(
    {
      dimensions: [{ name: "date" }],
      metrics: ["activeUsers", "sessions", "newUsers", "bounceRate", "averageSessionDuration", "keyEvents"].map((name) => ({ name })),
      orderBys: [{ dimension: { dimensionName: "date" } }],
    },
    "GA4 daily report"
  );
  let records = await upsertWebsiteDays(channel.id, GA4_SOURCE, daysFromReport(daily));

  try {
    const sources = await run(
      {
        dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      },
      "GA4 traffic sources"
    );
    const rows: BreakdownInput[] = [];
    for (const { d, m } of reportRows(sources)) {
      const date = parseDayString(d.date ?? "");
      if (date) rows.push({ date, kind: "SOURCE", key: d.sessionDefaultChannelGroup || "(not set)", sessions: finite(m.sessions), users: finite(m.activeUsers) });
    }
    records += await upsertBreakdowns(channel.id, rows);
  } catch (e) {
    if (e instanceof Error && e.name === "AuthError") throw e;
    notes.push("traffic sources unavailable");
  }

  try {
    const pages = await run(
      {
        dimensions: [{ name: "date" }, { name: "landingPagePlusQueryString" }],
        metrics: [{ name: "sessions" }, { name: "bounceRate" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 5000,
      },
      "GA4 landing pages"
    );
    const rows: BreakdownInput[] = [];
    for (const { d, m } of reportRows(pages)) {
      const date = parseDayString(d.date ?? "");
      if (!date) continue;
      rows.push({
        date,
        kind: "LANDING_PAGE",
        key: d.landingPagePlusQueryString || "(not set)",
        sessions: finite(m.sessions),
        bounceRate: m.bounceRate !== undefined && Number.isFinite(m.bounceRate) ? Number((m.bounceRate * 100).toFixed(2)) : null,
      });
    }
    records += await upsertBreakdowns(channel.id, rows);
  } catch (e) {
    if (e instanceof Error && e.name === "AuthError") throw e;
    notes.push("landing pages unavailable");
  }
  return { records, notes };
}
