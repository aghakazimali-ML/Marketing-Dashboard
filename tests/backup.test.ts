import { describe, expect, it } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const hasPgDump = spawnSync("pg_dump", ["--version"]).status === 0;

describe.skipIf(!hasPgDump)("backup script (PostgreSQL)", () => {
  it("writes a valid pg_dump archive and an encrypted variant", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "bk-"));
    const env = { ...process.env, BACKUP_DIR: dir };
    execSync("npx tsx scripts/backup.ts", { env, stdio: "pipe" });
    const dump = readdirSync(dir).find((f) => f.endsWith(".dump"))!;
    const listing = execSync(`pg_restore --list ${path.join(dir, dump)}`).toString();
    expect(listing).toContain("Channel");

    execSync("npx tsx scripts/backup.ts", { env: { ...env, BACKUP_ENCRYPTION_KEY: "a-long-backup-key-123456" }, stdio: "pipe" });
    const enc = readdirSync(dir).find((f) => f.endsWith(".dump.enc"))!;
    expect(existsSync(path.join(dir, enc.replace(/\.enc$/, "")))).toBe(false);
    expect(readFileSync(path.join(dir, enc)).subarray(0, 8).toString()).toBe("MDBKUP01");
  });
});
