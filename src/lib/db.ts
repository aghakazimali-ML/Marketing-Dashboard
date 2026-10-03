import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/** Bump when the schema changes so hot-reload drops a stale client. */
const PRISMA_SCHEMA_VERSION = 7;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaVersion?: number;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !/^postgres(ql)?:\/\//.test(connectionString)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string (postgresql://user:pass@host:5432/db).");
  }
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
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
