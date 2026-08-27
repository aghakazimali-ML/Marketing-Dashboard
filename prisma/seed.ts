import "dotenv/config";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, Platform } from "../src/generated/prisma/client";
import {
  subDays,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  eachMonthOfInterval,
  format,
} from "date-fns";

const url =
  process.env.DATABASE_URL ??
  `file:${path.join(process.cwd(), "prisma", "dev.db")}`;
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 2) {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

const LINKEDIN_PAGES = [
  { name: "NETS International", handle: "nets-international", baseFollowers: 18500, growth: 1.02 },
  { name: "Zenodigi", handle: "zenodigi", baseFollowers: 7100, growth: 1.03 },
  { name: "NETS Solutions", handle: "nets-solutions", baseFollowers: 4200, growth: 1.015 },
  { name: "NETS Careers", handle: "nets-careers", baseFollowers: 9800, growth: 1.025 },
  { name: "NETS Events", handle: "nets-events", baseFollowers: 3100, growth: 1.01 },
  { name: "NETS Innovation Lab", handle: "nets-innovation", baseFollowers: 2400, growth: 1.04 },
];

const FACEBOOK_PAGES = [
  { name: "NETS International", handle: "netsinternational", baseFollowers: 22400, growth: 1.012 },
  { name: "Zenodigi", handle: "zenodigi", baseFollowers: 8900, growth: 1.018 },
  { name: "NETS Careers", handle: "netscareers", baseFollowers: 5600, growth: 1.02 },
  { name: "NETS Community", handle: "netscommunity", baseFollowers: 11200, growth: 1.008 },
];

const POST_TITLES = [
  "Announcing our latest digital transformation partnership",
  "Inside NETS: How we scale customer experience",
  "5 trends reshaping payments in 2026",
  "Meet the team behind Zenodigi's newest launch",
  "Career spotlight: Engineering excellence at NETS",
  "Event recap: Innovation Summit highlights",
  "Why brands choose NETS for regional expansion",
  "Product update: Faster onboarding, smarter insights",
  "Community stories: Clients succeeding with NETS",
  "Behind the scenes at NETS Innovation Lab",
];

async function clearAll() {
  await prisma.postMetrics.deleteMany();
  await prisma.post.deleteMany();
  await prisma.metricSnapshot.deleteMany();
  await prisma.websiteSnapshot.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.channel.deleteMany();
}

async function seedChannels() {
  const channels: { id: string; platform: Platform; name: string }[] = [];

  for (const p of LINKEDIN_PAGES) {
    const c = await prisma.channel.create({
      data: {
        platform: Platform.LINKEDIN,
        name: p.name,
        handle: p.handle,
        externalId: `li_${p.handle}`,
      },
    });
    channels.push(c);
  }

  for (const p of FACEBOOK_PAGES) {
    const c = await prisma.channel.create({
      data: {
        platform: Platform.FACEBOOK,
        name: p.name,
        handle: p.handle,
        externalId: `fb_${p.handle}`,
      },
    });
    channels.push(c);
  }

  channels.push(
    await prisma.channel.create({
      data: {
        platform: Platform.INSTAGRAM,
        name: "NETS International",
        handle: "nets_international",
        externalId: "ig_nets",
      },
    })
  );

  channels.push(
    await prisma.channel.create({
      data: {
        platform: Platform.YOUTUBE,
        name: "NETS International",
        handle: "@NETSInternational",
        externalId: "yt_nets",
      },
    })
  );

  channels.push(
    await prisma.channel.create({
      data: {
        platform: Platform.WEBSITE,
        name: "nets.international",
        handle: "ga4_property",
        externalId: "ga4_nets",
      },
    })
  );

  return channels;
}

async function seedMonthlySnapshots(
  channelId: string,
  platform: Platform,
  baseFollowers: number,
  growth: number,
  months: Date[]
) {
  let followers = Math.round(baseFollowers / Math.pow(growth, months.length));

  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    const periodStart = startOfMonth(month);
    const periodEnd = endOfMonth(month);
    const newFollowers = Math.round(followers * (growth - 1) + rand(-20, 80));
    followers = followers + newFollowers;

    const impressions = rand(
      platform === Platform.LINKEDIN ? 80000 : 40000,
      platform === Platform.LINKEDIN ? 450000 : 280000
    );
    const reach = Math.round(impressions * randFloat(0.55, 0.85));
    const engagement = Math.round(impressions * randFloat(0.02, 0.08));
    const likes = Math.round(engagement * randFloat(0.55, 0.75));
    const comments = Math.round(engagement * randFloat(0.08, 0.18));
    const shares = Math.round(engagement * randFloat(0.05, 0.15));
    const clicks = Math.round(impressions * randFloat(0.004, 0.02));
    const engagementRate = Number(((engagement / impressions) * 100).toFixed(2));
    const ctr = Number(((clicks / impressions) * 100).toFixed(2));
    const isIg = platform === Platform.INSTAGRAM;
    const isYt = platform === Platform.YOUTUBE;

    await prisma.metricSnapshot.create({
      data: {
        channelId,
        syncedAt: periodEnd,
        periodStart,
        periodEnd,
        followers,
        newFollowers,
        impressions,
        reach,
        engagement,
        likes,
        comments,
        shares,
        clicks,
        saves: isIg ? rand(200, 1800) : 0,
        profileVisits: isIg ? rand(800, 5000) : rand(100, 2000),
        videoViews: isYt || isIg ? rand(5000, 120000) : 0,
        watchTimeMin: isYt ? rand(800, 12000) : 0,
        avgViewDurSec: isYt ? randFloat(90, 320, 1) : 0,
        returningViewers: isYt ? rand(400, 8000) : 0,
        ctr,
        engagementRate,
        postCount: rand(8, 28),
      },
    });
  }
}

async function seedWebsite(months: Date[]) {
  for (const month of months) {
    const periodStart = startOfMonth(month);
    const periodEnd = endOfMonth(month);
    const users = rand(12000, 45000);
    const sessions = Math.round(users * randFloat(1.2, 1.8));
    const newUsers = Math.round(users * randFloat(0.35, 0.55));

    await prisma.websiteSnapshot.create({
      data: {
        syncedAt: periodEnd,
        periodStart,
        periodEnd,
        users,
        sessions,
        newUsers,
        bounceRate: randFloat(38, 55),
        avgSessionDurationSec: rand(90, 280),
        conversions: rand(80, 420),
        goalCompletions: rand(60, 350),
        trafficSources: JSON.stringify([
          { source: "Organic Search", users: Math.round(users * 0.32), sessions: Math.round(sessions * 0.3) },
          { source: "Direct", users: Math.round(users * 0.22), sessions: Math.round(sessions * 0.24) },
          { source: "LinkedIn", users: Math.round(users * 0.18), sessions: Math.round(sessions * 0.17) },
          { source: "Facebook", users: Math.round(users * 0.08), sessions: Math.round(sessions * 0.09) },
          { source: "Instagram", users: Math.round(users * 0.05), sessions: Math.round(sessions * 0.05) },
          { source: "YouTube", users: Math.round(users * 0.06), sessions: Math.round(sessions * 0.06) },
          { source: "Referral", users: Math.round(users * 0.09), sessions: Math.round(sessions * 0.09) },
        ]),
        topLandingPages: JSON.stringify([
          { page: "/", sessions: Math.round(sessions * 0.28), bounceRate: randFloat(35, 52) },
          { page: "/services", sessions: Math.round(sessions * 0.16), bounceRate: randFloat(28, 45) },
          { page: "/about", sessions: Math.round(sessions * 0.12), bounceRate: randFloat(40, 58) },
          { page: "/careers", sessions: Math.round(sessions * 0.14), bounceRate: randFloat(30, 48) },
          { page: "/blog", sessions: Math.round(sessions * 0.1), bounceRate: randFloat(45, 65) },
          { page: "/contact", sessions: Math.round(sessions * 0.08), bounceRate: randFloat(25, 40) },
        ]),
      },
    });
  }
}

async function seedPosts(
  channelId: string,
  platform: Platform,
  channelName: string,
  months: Date[]
) {
  for (const month of months) {
    const count = platform === Platform.YOUTUBE ? rand(2, 5) : rand(4, 10);
    for (let i = 0; i < count; i++) {
      const day = rand(1, 27);
      const publishedAt = new Date(month.getFullYear(), month.getMonth(), day, rand(9, 17), 0);
      const title = POST_TITLES[rand(0, POST_TITLES.length - 1)];
      const impressions = rand(2000, 85000);
      const reach = Math.round(impressions * randFloat(0.6, 0.9));
      const likes = rand(40, 2500);
      const comments = rand(5, 180);
      const shares = rand(3, 220);
      const clicks = rand(20, 1200);
      const views =
        platform === Platform.YOUTUBE || platform === Platform.INSTAGRAM
          ? rand(1000, 95000)
          : impressions;
      const engagement = likes + comments + shares;
      const engagementRate = Number(((engagement / Math.max(impressions, 1)) * 100).toFixed(2));
      const ctr = Number(((clicks / Math.max(impressions, 1)) * 100).toFixed(2));

      const post = await prisma.post.create({
        data: {
          channelId,
          platform,
          externalId: `${platform}_${channelId.slice(0, 6)}_${format(publishedAt, "yyyyMMdd")}_${i}`,
          title: `${title} — ${channelName}`,
          content: title,
          thumbnailUrl: `https://picsum.photos/seed/${platform}${channelId.slice(0, 4)}${i}${month.getMonth()}/400/300`,
          permalink: `https://example.com/${platform.toLowerCase()}/post/${i}`,
          publishedAt,
          postType:
            platform === Platform.YOUTUBE
              ? "video"
              : platform === Platform.INSTAGRAM
                ? i % 3 === 0
                  ? "reel"
                  : "post"
                : "post",
        },
      });

      await prisma.postMetrics.create({
        data: {
          postId: post.id,
          syncedAt: endOfMonth(month),
          periodStart: startOfMonth(month),
          periodEnd: endOfMonth(month),
          likes,
          comments,
          shares,
          impressions,
          reach,
          clicks,
          saves: platform === Platform.INSTAGRAM ? rand(10, 400) : 0,
          views,
          engagementRate,
          ctr,
        },
      });
    }
  }
}

async function seedRecentWeekly(channelId: string, platform: Platform, latestFollowers: number) {
  const now = new Date();
  for (let w = 3; w >= 0; w--) {
    const periodEnd = endOfDay(subDays(now, w * 7));
    const periodStart = startOfDay(subDays(periodEnd, 6));
    const impressions = rand(15000, 90000);
    const engagement = Math.round(impressions * randFloat(0.03, 0.07));
    const clicks = Math.round(impressions * randFloat(0.005, 0.015));
    await prisma.metricSnapshot.create({
      data: {
        channelId,
        syncedAt: periodEnd,
        periodStart,
        periodEnd,
        followers: latestFollowers + rand(-50, 120),
        newFollowers: rand(20, 180),
        impressions,
        reach: Math.round(impressions * 0.7),
        engagement,
        likes: Math.round(engagement * 0.65),
        comments: Math.round(engagement * 0.12),
        shares: Math.round(engagement * 0.1),
        clicks,
        engagementRate: Number(((engagement / impressions) * 100).toFixed(2)),
        ctr: Number(((clicks / impressions) * 100).toFixed(2)),
        postCount: rand(2, 8),
        videoViews: platform === Platform.YOUTUBE || platform === Platform.INSTAGRAM ? rand(2000, 40000) : 0,
        watchTimeMin: platform === Platform.YOUTUBE ? rand(200, 3000) : 0,
        avgViewDurSec: platform === Platform.YOUTUBE ? randFloat(80, 280, 1) : 0,
        returningViewers: platform === Platform.YOUTUBE ? rand(100, 2000) : 0,
        saves: platform === Platform.INSTAGRAM ? rand(50, 600) : 0,
        profileVisits: rand(50, 1500),
      },
    });
  }
}

async function main() {
  console.log("Seeding NETS Marketing dashboard data...");
  await clearAll();

  const now = new Date();
  const months = eachMonthOfInterval({
    start: startOfMonth(subMonths(now, 7)),
    end: startOfMonth(now),
  });

  const channels = await seedChannels();

  for (const meta of LINKEDIN_PAGES) {
    const ch = channels.find((c) => c.platform === Platform.LINKEDIN && c.name === meta.name)!;
    await seedMonthlySnapshots(ch.id, Platform.LINKEDIN, meta.baseFollowers, meta.growth, months);
    await seedPosts(ch.id, Platform.LINKEDIN, meta.name, months.slice(-4));
    await seedRecentWeekly(ch.id, Platform.LINKEDIN, meta.baseFollowers);
  }

  for (const meta of FACEBOOK_PAGES) {
    const ch = channels.find((c) => c.platform === Platform.FACEBOOK && c.name === meta.name)!;
    await seedMonthlySnapshots(ch.id, Platform.FACEBOOK, meta.baseFollowers, meta.growth, months);
    await seedPosts(ch.id, Platform.FACEBOOK, meta.name, months.slice(-4));
    await seedRecentWeekly(ch.id, Platform.FACEBOOK, meta.baseFollowers);
  }

  const ig = channels.find((c) => c.platform === Platform.INSTAGRAM)!;
  await seedMonthlySnapshots(ig.id, Platform.INSTAGRAM, 15400, 1.022, months);
  await seedPosts(ig.id, Platform.INSTAGRAM, "NETS International", months.slice(-4));
  await seedRecentWeekly(ig.id, Platform.INSTAGRAM, 15400);

  const yt = channels.find((c) => c.platform === Platform.YOUTUBE)!;
  await seedMonthlySnapshots(yt.id, Platform.YOUTUBE, 8200, 1.028, months);
  await seedPosts(yt.id, Platform.YOUTUBE, "NETS International", months.slice(-4));
  await seedRecentWeekly(yt.id, Platform.YOUTUBE, 8200);

  await seedWebsite(months);

  for (let w = 3; w >= 0; w--) {
    const periodEnd = endOfDay(subDays(now, w * 7));
    const periodStart = startOfDay(subDays(periodEnd, 6));
    const users = rand(3000, 12000);
    const sessions = Math.round(users * 1.4);
    await prisma.websiteSnapshot.create({
      data: {
        syncedAt: periodEnd,
        periodStart,
        periodEnd,
        users,
        sessions,
        newUsers: Math.round(users * 0.45),
        bounceRate: randFloat(38, 52),
        avgSessionDurationSec: rand(100, 240),
        conversions: rand(20, 100),
        goalCompletions: rand(15, 80),
        trafficSources: JSON.stringify([
          { source: "Organic Search", users: Math.round(users * 0.3), sessions: Math.round(sessions * 0.3) },
          { source: "LinkedIn", users: Math.round(users * 0.2), sessions: Math.round(sessions * 0.2) },
          { source: "Direct", users: Math.round(users * 0.25), sessions: Math.round(sessions * 0.25) },
          { source: "Facebook", users: Math.round(users * 0.1), sessions: Math.round(sessions * 0.1) },
          { source: "YouTube", users: Math.round(users * 0.08), sessions: Math.round(sessions * 0.08) },
          { source: "Instagram", users: Math.round(users * 0.07), sessions: Math.round(sessions * 0.07) },
        ]),
        topLandingPages: JSON.stringify([
          { page: "/", sessions: Math.round(sessions * 0.3), bounceRate: 42 },
          { page: "/services", sessions: Math.round(sessions * 0.18), bounceRate: 35 },
          { page: "/careers", sessions: Math.round(sessions * 0.15), bounceRate: 38 },
        ]),
      },
    });
  }

  await prisma.syncRun.create({
    data: {
      platform: Platform.LINKEDIN,
      status: "SUCCESS",
      finishedAt: new Date(),
      message: "Seed data loaded",
      recordsUpserted: LINKEDIN_PAGES.length * months.length,
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
