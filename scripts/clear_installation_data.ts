import "dotenv/config";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const url =
  process.env.DATABASE_URL ??
  `file:${path.join(process.cwd(), "prisma", "dev.db")}`;
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Clearing analytics, connected channels, team accounts, invites, and saved AI settings.");
  await prisma.channelDailyMetric.deleteMany();
  await prisma.websiteDailyMetric.deleteMany();
  await prisma.websiteBreakdown.deleteMany();
  await prisma.postMetrics.deleteMany();
  await prisma.post.deleteMany();
  await prisma.metricSnapshot.deleteMany();
  await prisma.websiteSnapshot.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.teamInvite.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.aiSettings.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.apiKey.deleteMany();
  console.log("Installation data cleared. The owner account and environment configuration were preserved.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });