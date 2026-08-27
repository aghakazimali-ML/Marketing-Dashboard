import "dotenv/config";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/** Bump when Channel / schema fields change so hot-reload drops a stale client. */
const PRISMA_SCHEMA_VERSION = 2;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaVersion?: number;
};

function createPrismaClient() {
  const url =
    process.env.DATABASE_URL ??
    `file:${path.join(process.cwd(), "prisma", "dev.db")}`;
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

if (globalForPrisma.prismaSchemaVersion !== PRISMA_SCHEMA_VERSION) {
  void globalForPrisma.prisma?.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
