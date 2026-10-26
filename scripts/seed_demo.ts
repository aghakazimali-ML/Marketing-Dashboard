/**
 * Load clearly-labelled DEMO data so a fresh local install shows charts instead of empty screens.
 *   npm run seed-demo            add (or refresh) demo channels with 90 days of metrics
 *   npm run seed-demo -- --clear remove only the demo channels (their metrics are deleted with them)
 * Demo channels are marked with notes = "demo-data" and named "... (demo)". Real channels are never touched,
 * and live fetches skip demo channels so the sample data is never overwritten or double-counted.
 * Refuses to run when NODE_ENV=production.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { DEMO_NOTES as MARK } from "../src/lib/demo";

const DAYS = 90;
type Platform = "LINKEDIN" | "FACEBOOK" | "INSTAGRAM" | "YOUTUBE";

const SOCIAL: { platform: Platform; name: string; followers: number; imp: number }[] = [
  { platform: "LINKEDIN", name: "LinkedIn Company Page (demo)", followers: 8200, imp: 2600 },
  { platform: "FACEBOOK", name: "Facebook Page (demo)", followers: 14600, imp: 3800 },
  { platform: "INSTAGRAM", name: "Instagram Account (demo)", followers: 21400, imp: 5200 },
  { platform: "YOUTUBE", name: "YouTube Channel (demo)", followers: 6900, imp: 1800 },
];
const SOURCES: [string, number][] = [["Organic Search", 420], ["Direct", 310], ["Organic Social", 260], ["Paid Search", 180], ["Referral", 150], ["Email", 90]];
const PAGES: [string, number][] = [["/", 300], ["/pricing", 190], ["/blog/marketing-reports", 140], ["/features", 120], ["/contact", 70]];

/** Smooth, repeatable "weekly rhythm + slow growth" curve, so charts look natural and re-runs match. */
const wave = (day: number, phase: number) => 1 + 0.18 * Math.sin(day / 4.5 + phase) + (day % 7 >= 5 ? -0.12 : 0.04);
const midnight = (daysAgo: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
};

async function clear() {
  const res = await prisma.channel.deleteMany({ where: { notes: MARK } });
  console.log(`Removed ${res.count} demo channel(s) and their metrics.`);
}

async function ensureChannel(platform: "WEBSITE" | Platform, name: string) {
  const existing = await prisma.channel.findFirst({ where: { notes: MARK, platform, name } });
  if (existing) return existing;
  return prisma.channel.create({ data: { platform, name, notes: MARK, isActive: true, lastSuccessAt: new Date() } });
}

async function seed() {
  for (const [pi, s] of SOCIAL.entries()) {
    const ch = await ensureChannel(s.platform, s.name);
    for (let d = DAYS - 1; d >= 0; d--) {
      const date = midnight(d);
      const k = wave(d, pi);
      const impressions = Math.round(s.imp * k);
      const engagement = Math.round(impressions * (0.035 + 0.01 * pi + 0.004 * Math.sin(d / 6)));
      const data = {
        followers: s.followers + (DAYS - d) * (4 + pi * 2),
        newFollowers: Math.round(6 + pi * 3 + 4 * Math.sin(d / 3)),
        impressions,
        reach: Math.round(impressions * 0.7),
        engagement,
        likes: Math.round(engagement * 0.7),
        comments: Math.round(engagement * 0.1),
        shares: Math.round(engagement * 0.08),
        clicks: Math.round(impressions * 0.012),
        source: "demo",
      };
      await prisma.channelDailyMetric.upsert({
        where: { channelId_date: { channelId: ch.id, date } },
        create: { channelId: ch.id, date, ...data },
        update: data,
      });
    }
  }

  const site = await ensureChannel("WEBSITE", "Website (demo)");
  for (let d = DAYS - 1; d >= 0; d--) {
    const date = midnight(d);
    const k = wave(d, 2);
    const sessions = Math.round(520 * k);
    const data = {
      users: Math.round(sessions * 0.62),
      sessions,
      newUsers: Math.round(sessions * 0.35),
      bounceRate: 41 + 4 * Math.sin(d / 5),
      avgSessionDurationSec: 96 + 14 * Math.sin(d / 7),
      conversions: Math.round(sessions * 0.03),
      source: "demo",
    };
    await prisma.websiteDailyMetric.upsert({
      where: { propertyChannelId_date: { propertyChannelId: site.id, date } },
      create: { propertyChannelId: site.id, date, ...data },
      update: data,
    });
    const rows = [
      ...SOURCES.map(([key, n]) => ({ kind: "SOURCE", key, n })),
      ...PAGES.map(([key, n]) => ({ kind: "LANDING_PAGE", key, n })),
    ];
    for (const r of rows) {
      const bd = { users: Math.round(r.n * k * 0.6), sessions: Math.round(r.n * k), bounceRate: 35 + (r.n % 20) };
      await prisma.websiteBreakdown.upsert({
        where: { channelId_date_kind_key: { channelId: site.id, date, kind: r.kind, key: r.key } },
        create: { channelId: site.id, date, kind: r.kind, key: r.key, ...bd },
        update: bd,
      });
    }
  }
  console.log(`Demo data loaded: ${SOCIAL.length} social channels + 1 website, ${DAYS} days each.`);
  console.log("Remove it any time with: npm run seed-demo -- --clear");
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("seed-demo refuses to run when NODE_ENV=production.");
  if (process.argv.includes("--clear")) await clear();
  else await seed();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
