import { describe, expect, it } from "vitest";
import {
  aggregateChannelDays,
  aggregateWebsiteDays,
  postEngagement,
  ratioPct,
  sumNullable,
  type DailyChannelRow,
} from "@/lib/metrics/aggregate";

const blank = (date: string, over: Partial<DailyChannelRow> = {}): DailyChannelRow => ({
  date: new Date(`${date}T00:00:00Z`),
  followers: null, newFollowers: null, impressions: null, reach: null, engagement: null,
  likes: null, comments: null, shares: null, clicks: null, saves: null, profileVisits: null,
  videoViews: null, watchTimeMin: null, avgViewDurSec: null, returningViewers: null,
  postCount: null,
  ...over,
});

describe("sumNullable", () => {
  it("returns null when nothing was reported, never 0", () => {
    expect(sumNullable([null, undefined])).toBeNull();
    expect(sumNullable([])).toBeNull();
  });
  it("skips nulls but keeps real zeros", () => {
    expect(sumNullable([1, null, 2])).toBe(3);
    expect(sumNullable([0, null])).toBe(0);
  });
});

describe("aggregateChannelDays", () => {
  const days = [
    blank("2026-09-01", { followers: 100, impressions: 1000, engagement: 50, clicks: 10 }),
    blank("2026-09-02", { followers: 110, impressions: 3000, engagement: 150, clicks: 30 }),
    blank("2026-09-03", { followers: 130, impressions: null, engagement: null, clicks: null }),
  ];

  it("sums additive metrics and keeps the latest follower count", () => {
    const a = aggregateChannelDays("LINKEDIN", days, 90);
    expect(a.impressions).toBe(4000);
    expect(a.engagement).toBe(200);
    expect(a.followers).toBe(130);
  });

  it("derives new followers from the count before the range", () => {
    expect(aggregateChannelDays("LINKEDIN", days, 90).newFollowers).toBe(40);
  });

  it("falls back to reported daily gains when no earlier count exists", () => {
    const a = aggregateChannelDays(
      "LINKEDIN",
      [blank("2026-09-01", { newFollowers: 3 }), blank("2026-09-02", { newFollowers: 4 })],
      null
    );
    expect(a.newFollowers).toBe(7);
  });

  it("computes engagement rate and CTR from totals, not averages of daily rates", () => {
    const a = aggregateChannelDays("LINKEDIN", days, 90);
    expect(a.engagementRate).toBe(5); // 200 / 4000
    expect(a.ctr).toBe(1); // 40 / 4000
  });

  it("uses reach as the Instagram engagement-rate denominator", () => {
    const a = aggregateChannelDays(
      "INSTAGRAM",
      [blank("2026-09-01", { engagement: 30, impressions: 1000, reach: 200 })],
      null
    );
    expect(a.engagementRate).toBe(15);
  });

  it("returns null (not 0) when there is no data", () => {
    const a = aggregateChannelDays("FACEBOOK", [], null);
    expect(a.impressions).toBeNull();
    expect(a.engagementRate).toBeNull();
    expect(a.followers).toBeNull();
    expect(a.newFollowers).toBeNull();
  });

  it("weights average view duration by views", () => {
    const a = aggregateChannelDays(
      "YOUTUBE",
      [
        blank("2026-09-01", { avgViewDurSec: 100, videoViews: 10 }),
        blank("2026-09-02", { avgViewDurSec: 200, videoViews: 30 }),
      ],
      null
    );
    expect(a.avgViewDurSec).toBe(175);
  });
});

describe("aggregateWebsiteDays", () => {
  it("weights bounce rate and duration by sessions", () => {
    const base = { users: 1, newUsers: 1, conversions: 0 };
    const a = aggregateWebsiteDays([
      { date: new Date(), ...base, sessions: 100, bounceRate: 50, avgSessionDurationSec: 60 },
      { date: new Date(), ...base, sessions: 300, bounceRate: 30, avgSessionDurationSec: 100 },
    ]);
    expect(a.sessions).toBe(400);
    expect(a.bounceRate).toBe(35);
    expect(a.avgSessionDurationSec).toBe(90);
  });
});

describe("misc", () => {
  it("ratioPct guards against zero and null", () => {
    expect(ratioPct(5, 0)).toBeNull();
    expect(ratioPct(null, 10)).toBeNull();
    expect(ratioPct(1, 8)).toBe(12.5);
  });
  it("postEngagement is null when no counters exist", () => {
    expect(postEngagement({ likes: null, comments: null, shares: null, saves: null })).toBeNull();
    expect(postEngagement({ likes: 2, comments: 1, shares: null, saves: 4 })).toBe(7);
  });
});
