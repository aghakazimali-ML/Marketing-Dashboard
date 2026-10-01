import "dotenv/config";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
const url =
  process.env.DATABASE_URL ??
  `file:${path.join(process.cwd(), "prisma", "dev.db")}`;
const adapter = new PrismaBetterSqlite3({ url });
async function run() {
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const prisma = new PrismaClient({ adapter });
  try {
    const counts = await Promise.all([
      prisma.channel.count(),
      prisma.post.count(),
      prisma.postMetrics.count(),
      prisma.metricSnapshot.count(),
      prisma.websiteSnapshot.count(),
      prisma.syncRun.count(),
      prisma.dashboardOwner.count(),
      prisma.teamMember.count(),
      prisma.teamInvite.count(),
      prisma.aiSettings.count(),
    ]);
    console.log("Counts [channels, posts, postMetrics, metricSnapshots, websiteSnapshots, syncRuns, owners, teamMembers, invites, aiSettings]:", counts);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
