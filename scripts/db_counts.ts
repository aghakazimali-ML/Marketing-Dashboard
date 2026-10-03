import "dotenv/config";
import { prisma } from "../src/lib/db";

async function run() {
  try {
    const entries = await Promise.all([
      ["channels", prisma.channel.count()],
      ["dailyMetrics", prisma.channelDailyMetric.count()],
      ["websiteDaily", prisma.websiteDailyMetric.count()],
      ["posts", prisma.post.count()],
      ["syncRuns", prisma.syncRun.count()],
      ["owners", prisma.dashboardOwner.count()],
      ["teamMembers", prisma.teamMember.count()],
      ["invites", prisma.teamInvite.count()],
    ].map(async ([k, p]) => [k, await (p as Promise<number>)] as const));
    console.log(Object.fromEntries(entries));
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
