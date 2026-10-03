import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { syncLinkedInChannel, dailyShareRows, engagementCount } from "@/lib/sync/linkedin";
import { syncFacebookChannel, syncInstagramChannel, dayFromEndTime } from "@/lib/sync/meta";
import { syncYouTubeChannel, analyticsRows, parseIsoDuration } from "@/lib/sync/youtube";
import { syncGA4Channel } from "@/lib/sync/ga4";
import { AuthError } from "@/lib/sync/http";
import { utcDay } from "@/lib/metrics/dates";
import type { Platform } from "@/generated/prisma/client";

type Route = [RegExp, unknown | ((url: string, init?: RequestInit) => unknown)];
const calls: { url: string; init?: RequestInit }[] = [];

function mockFetch(routes: Route[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      for (const [re, body] of routes) {
        if (re.test(url)) {
          const payload = typeof body === "function" ? (body as (u: string, i?: RequestInit) => unknown)(url, init) : body;
          if (payload instanceof Response) return payload;
          return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
        }
      }
      return new Response("not mocked", { status: 404 });
    })
  );
}
const err = (status: number, body = "{}") => new Response(body, { status });

const today = utcDay(new Date());
const from = new Date(today.getTime() - 2 * 86_400_000);

async function channel(platform: Platform, externalId: string) {
  const ch = await prisma.channel.create({ data: { platform, name: `${platform} test`, externalId } });
  return { channel: ch, token: "tok_test", today, from };
}

beforeEach(async () => {
  calls.length = 0;
  await prisma.channel.deleteMany();
});
afterEach(() => vi.unstubAllGlobals());

describe("LinkedIn connector", () => {
  const start = from.getTime();
  const shareEls = [
    { timeRange: { start }, totalShareStatistics: { impressionCount: 1000, uniqueImpressionsCount: 600, clickCount: 20, likeCount: 30, commentCount: 5, shareCount: 5 } },
  ];

  it("maps daily statistics without estimating reach or using the engagement rate field", () => {
    const [row] = dailyShareRows([{ ...shareEls[0], totalShareStatistics: { ...shareEls[0].totalShareStatistics, ...{ engagement: 0.06 } as object } }]);
    expect(row.impressions).toBe(1000);
    expect(row.reach).toBe(600); // real uniqueImpressionsCount, not impressions * 0.75
    expect(row.engagement).toBe(60); // likes + comments + shares + clicks
    expect(engagementCount({ likeCount: 1, clickCount: 2 })).toBe(3);
  });

  it("sends the versioned headers and stores daily rows and followers", async () => {
    mockFetch([
      [/organizationalEntityShareStatistics.*timeIntervals/, { elements: shareEls }],
      [/organizationalEntityFollowerStatistics/, { elements: [{ timeRange: { start }, followerGains: { organicFollowerGain: 4, paidFollowerGain: 1 } }] }],
      [/networkSizes/, { firstDegreeSize: 4321 }],
      [/\/rest\/posts/, { elements: [] }],
    ]);
    const ctx = await channel("LINKEDIN", "123");
    const result = await syncLinkedInChannel(ctx);
    expect(result.records).toBeGreaterThan(0);

    const first = calls[0];
    expect((first.init?.headers as Record<string, string>)["LinkedIn-Version"]).toMatch(/^\d{6}$/);
    expect(first.url).toContain("timeGranularityType:DAY");

    const rows = await prisma.channelDailyMetric.findMany({ orderBy: { date: "asc" } });
    expect(rows.find((r) => r.date.getTime() === utcDay(from).getTime())).toMatchObject({ impressions: 1000, reach: 600, newFollowers: 5 });
    expect(rows.find((r) => r.date.getTime() === today.getTime())?.followers).toBe(4321);
  });

  it("raises AuthError on 401 so the channel can be flagged for reconnect", async () => {
    mockFetch([[/organizationalEntityShareStatistics/, () => err(401)]]);
    await expect(syncLinkedInChannel(await channel("LINKEDIN", "123"))).rejects.toBeInstanceOf(AuthError);
  });
});

describe("Meta connectors", () => {
  it("parses end_time into the covered day", () => {
    expect(dayFromEndTime("2026-09-02T07:00:00+0000").toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("Facebook: current metric names, bearer header (no token in URL), failed metric becomes null", async () => {
    const day = new Date(today.getTime() + 7 * 3600_000).toISOString();
    mockFetch([
      [/\/insights\?metric=page_media_view/, { data: [{ name: "page_media_view", values: [{ value: 900, end_time: day }] }] }],
      [/\/insights\?metric=page_total_media_view_unique/, () => err(400, '{"error":{"code":100,"message":"invalid metric"}}')],
      [/\/insights\?metric=page_post_engagements/, { data: [{ name: "x", values: [{ value: 45, end_time: day }] }] }],
      [/\/insights\?metric=page_daily_follows_unique/, { data: [{ name: "x", values: [{ value: 3, end_time: day }] }] }],
      [/\/posts\?/, { data: [] }],
      [/graph\.facebook\.com\/v[\d.]+\/\d+\?fields=followers_count/, { followers_count: 777 }],
    ]);
    const res = await syncFacebookChannel(await channel("FACEBOOK", "555"));
    expect(res.notes).toContain("page_total_media_view_unique unavailable");
    for (const c of calls) {
      expect(c.url).not.toContain("access_token");
      expect((c.init?.headers as Record<string, string>).Authorization).toBe("Bearer tok_test");
    }
    expect(calls[0].url).toMatch(/graph\.facebook\.com\/v25\.0\//);
    const rows = await prisma.channelDailyMetric.findMany();
    expect(rows.some((r) => r.impressions === 900 && r.reach === null)).toBe(true);
    expect(rows.some((r) => r.followers === 777)).toBe(true);
  });

  it("Facebook: OAuth error code 190 means reconnect", async () => {
    mockFetch([[/graph\.facebook\.com/, () => err(400, '{"error":{"code":190,"type":"OAuthException"}}')]]);
    await expect(syncFacebookChannel(await channel("FACEBOOK", "555"))).rejects.toBeInstanceOf(AuthError);
  });

  it("Instagram: engagement = likes+comments+shares+saves, per-day views/reach", async () => {
    mockFetch([
      [/follower_count/, { data: [] }],
      [/metric_type=total_value/, {
        data: [
          { name: "views", total_value: { value: 500 } },
          { name: "reach", total_value: { value: 200 } },
          { name: "likes", total_value: { value: 10 } },
          { name: "comments", total_value: { value: 2 } },
          { name: "shares", total_value: { value: 3 } },
          { name: "saves", total_value: { value: 5 } },
        ],
      }],
      [/\/media\?/, { data: [] }],
      [/fields=followers_count/, { followers_count: 90 }],
    ]);
    await syncInstagramChannel(await channel("INSTAGRAM", "999"));
    const row = await prisma.channelDailyMetric.findFirst({ where: { date: today } });
    expect(row).toMatchObject({ impressions: 500, reach: 200, engagement: 20, followers: 90, profileVisits: null });
  });
});

describe("YouTube connector", () => {
  it("parses positional analytics rows and ISO durations", () => {
    const rows = analyticsRows({ columnHeaders: [{ name: "day" }, { name: "views" }], rows: [["2026-09-01", 12]] });
    expect(rows[0].values.views).toBe(12);
    expect(parseIsoDuration("PT1M5S")).toBe(65);
  });

  it("uses the Analytics API for the period and never stores lifetime totals as period values", async () => {
    const d = from.toISOString().slice(0, 10);
    mockFetch([
      [/youtubeanalytics\.googleapis\.com.*metrics=returningViewers/, () => err(400)],
      [/youtubeanalytics\.googleapis\.com/, {
        columnHeaders: ["day", "views", "estimatedMinutesWatched", "averageViewDuration", "subscribersGained", "subscribersLost", "likes", "comments", "shares"].map((name) => ({ name })),
        rows: [[d, 100, 250, 90, 7, 2, 10, 3, 1]],
      }],
      [/\/channels\?/, { items: [{ statistics: { subscriberCount: "5000", viewCount: "9999999" }, contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] }],
      [/playlistItems/, { items: [{ contentDetails: { videoId: "vid1" } }] }],
      [/\/videos\?/, { items: [{ id: "vid1", snippet: { title: "Hello #shorts", publishedAt: new Date().toISOString() }, statistics: { viewCount: "50", likeCount: "5", commentCount: "1" }, contentDetails: { duration: "PT45S" } }] }],
    ]);
    const res = await syncYouTubeChannel(await channel("YOUTUBE", "UC123"));
    expect(res.notes).toContain("YouTube returning viewers unavailable");
    const row = await prisma.channelDailyMetric.findFirst({ where: { date: utcDay(from) } });
    expect(row).toMatchObject({ videoViews: 100, watchTimeMin: 250, avgViewDurSec: 90, newFollowers: 5, engagement: 14 });
    // lifetime viewCount (9,999,999) must not appear as a daily view count anywhere
    expect(await prisma.channelDailyMetric.count({ where: { videoViews: 9999999 } })).toBe(0);
    const post = await prisma.post.findFirst();
    expect(post?.postType).toBe("short");
  });
});

describe("GA4 connector", () => {
  it("requests a date dimension, keyEvents, converts bounce rate to percent and stores breakdowns", async () => {
    const date = from.toISOString().slice(0, 10).replace(/-/g, "");
    mockFetch([
      [/runReport/, (_u: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        const dims = body.dimensions.map((d: { name: string }) => d.name);
        if (dims.includes("sessionDefaultChannelGroup")) {
          return { dimensionHeaders: dims.map((name: string) => ({ name })), metricHeaders: [{ name: "sessions" }, { name: "activeUsers" }], rows: [{ dimensionValues: [{ value: date }, { value: "Organic Search" }], metricValues: [{ value: "40" }, { value: "30" }] }] };
        }
        if (dims.includes("landingPagePlusQueryString")) {
          return { dimensionHeaders: dims.map((name: string) => ({ name })), metricHeaders: [{ name: "sessions" }, { name: "bounceRate" }], rows: [{ dimensionValues: [{ value: date }, { value: "/pricing" }], metricValues: [{ value: "25" }, { value: "0.4" }] }] };
        }
        expect(body.metrics.map((m: { name: string }) => m.name)).toContain("keyEvents");
        expect(body.metrics.map((m: { name: string }) => m.name)).not.toContain("conversions");
        return { dimensionHeaders: [{ name: "date" }], metricHeaders: ["activeUsers", "sessions", "newUsers", "bounceRate", "averageSessionDuration", "keyEvents"].map((name) => ({ name })), rows: [{ dimensionValues: [{ value: date }], metricValues: ["80", "100", "50", "0.35", "62.5", "7"].map((value) => ({ value })) }] };
      }],
    ]);
    await syncGA4Channel(await channel("WEBSITE", "123456"));
    const day = await prisma.websiteDailyMetric.findFirst();
    expect(day).toMatchObject({ users: 80, sessions: 100, bounceRate: 35, avgSessionDurationSec: 62.5, conversions: 7 });
    expect(await prisma.websiteBreakdown.count({ where: { kind: "SOURCE", key: "Organic Search" } })).toBe(1);
    const lp = await prisma.websiteBreakdown.findFirst({ where: { kind: "LANDING_PAGE" } });
    expect(lp).toMatchObject({ key: "/pricing", sessions: 25, bounceRate: 40 });
  });
});
