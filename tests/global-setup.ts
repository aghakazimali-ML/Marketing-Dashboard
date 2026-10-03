import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

export const TEST_DB = path.join(process.cwd(), "prisma", "test.db");

export default function setup() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    rmSync(`${TEST_DB}${suffix}`, { force: true });
  }
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
  });
}
