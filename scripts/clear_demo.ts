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
  console.log("Clearing demo data from database:", url);
  await prisma.postMetrics.deleteMany();
  await prisma.post.deleteMany();
  await prisma.metricSnapshot.deleteMany();
  await prisma.websiteSnapshot.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.channel.deleteMany();
  console.log("Demo data cleared.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
