import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resolveDateRange } from "@/lib/metrics/periods";
import { getChannelMetricsForRange, getWebsiteMetrics } from "@/lib/metrics/queries";
import { upsertBreakdowns, upsertChannelDays, upsertWebsiteDays } from "@/lib/sync/store";

const NOW = new Date(2026, 8, 30, 12); // 30 Sep 2026, local
const range = resolveDateRange("last_30", undefined, undefined, NOW);

function days(n: number, impressions: number) {
  // 30 Sep back n days (UTC-midnight keys)
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, 30 - i)),
    impressions,
    engagement: 1,
    followers: 1000 + (n - i),
  }));
}

beforeEach(async () => {
  await prisma.channel.deleteMany();
});

describe("daily storage (B1)", () => {
  it("fetching three times in a row does not change any total", async () => {
    const ch = await prisma.channel.create({ data: { platform: "LINKEDIN", name: "Acme" } });
    const totals = [];
    for (let i = 0; i < 3; i++) {
      await upsertChannelDays(ch.id, "linkedin:test", days(30, 100));
      const [row] = await getChannelMetricsForRange("LINKEDIN", range);
      totals.push({ imp: row.impressions, eng: row.engagement, followers: row.followers });
    }
    expect(totals[0]).toEqual({ imp: 3000, eng: 30, followers: 1030 });
    expect(totals[1]).toEqual(totals[0]);
    expect(totals[2]).toEqual(totals[0]);
    expect(await prisma.channelDailyMetric.count()).toBe(30);
  });

  it("'Last 30 days' equals the sum of the daily rows in range", async () => {
    const ch = await prisma.channel.create({ data: { platform: "FACEBOOK", name: "FB" } });
    await upsertChannelDays(ch.id, "meta:test", days(45, 10)); // 15 days fall outside the range
    const [row] = await getChannelMetricsForRange("FACEBOOK", range);
    expect(row.impressions).toBe(300);
  });

  it("re-fetching overwrites a changed day instead of adding", async () => {
    const ch = await prisma.channel.create({ data: { platform: "LINKEDIN", name: "Acme" } });
    await upsertChannelDays(ch.id, "t", days(1, 100));
    await upsertChannelDays(ch.id, "t", days(1, 250));
    const [row] = await getChannelMetricsForRange("LINKEDIN", range);
    expect(row.impressions).toBe(250);
  });

  it("a partial update keeps metrics it did not fetch", async () => {
    const ch = await prisma.channel.create({ data: { platform: "LINKEDIN", name: "Acme" } });
    const date = new Date(Date.UTC(2026, 8, 30));
    await upsertChannelDays(ch.id, "t", [{ date, impressions: 100 }]);
    await upsertChannelDays(ch.id, "t", [{ date, followers: 55 }]);
    const [row] = await getChannelMetricsForRange("LINKEDIN", range);
    expect(row.impressions).toBe(100);
    expect(row.followers).toBe(55);
  });

  it("a channel without data reports null, not zero", async () => {
    await prisma.channel.create({ data: { platform: "INSTAGRAM", name: "IG" } });
    const [row] = await getChannelMetricsForRange("INSTAGRAM", range);
    expect(row.impressions).toBeNull();
    expect(row.engagementRate).toBeNull();
  });

  it("computes new followers against the count before the range", async () => {
    const ch = await prisma.channel.create({ data: { platform: "LINKEDIN", name: "Acme" } });
    await upsertChannelDays(ch.id, "t", [
      { date: new Date(Date.UTC(2026, 7, 1)), followers: 900 }, // before range
      { date: new Date(Date.UTC(2026, 8, 30)), followers: 960 },
    ]);
    const [row] = await getChannelMetricsForRange("LINKEDIN", range);
    expect(row.newFollowers).toBe(60);
  });

  it("website totals are stable across repeated fetches and use weighted averages", async () => {
    const ch = await prisma.channel.create({ data: { platform: "WEBSITE", name: "site" } });
    const rows = [
      { date: new Date(Date.UTC(2026, 8, 29)), sessions: 100, users: 80, bounceRate: 50 },
      { date: new Date(Date.UTC(2026, 8, 30)), sessions: 300, users: 200, bounceRate: 30 },
    ];
    for (let i = 0; i < 3; i++) {
      await upsertWebsiteDays(ch.id, "ga4:test", rows);
      await upsertBreakdowns(ch.id, [
        { date: rows[1].date, kind: "SOURCE", key: "Organic Search", sessions: 200, users: 150 },
      ]);
    }
    const w = await getWebsiteMetrics(range);
    expect(w.sessions).toBe(400);
    expect(w.bounceRate).toBe(35);
    expect(w.trafficSources).toEqual([{ source: "Organic Search", sessions: 200, users: 150 }]);
  });
});
