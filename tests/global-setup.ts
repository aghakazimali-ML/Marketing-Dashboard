import { execSync } from "node:child_process";
import pg from "pg";

/** Tests run against a real PostgreSQL database: its schema is recreated and migrations re-applied on every run. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://dash:dash@127.0.0.1:5432/dashboard_test";

export default async function setup() {
  // Safety: only ever wipe a database whose name says it is for tests.
  const dbName = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "");
  if (!/test/i.test(dbName)) throw new Error(`Refusing to reset "${dbName}": the test database name must contain "test".`);

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  } finally {
    await client.end();
  }
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL } });
}
