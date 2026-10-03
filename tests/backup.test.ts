import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

describe("backup script", () => {
  it("writes a consistent, restorable SQLite copy and an encrypted variant", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "bk-"));
    const env = { ...process.env, BACKUP_DIR: dir };
    execSync("npx tsx scripts/backup.ts", { env, stdio: "pipe" });
    const plain = readdirSync(dir).find((f) => f.endsWith(".db"))!;
    const db = new Database(path.join(dir, plain), { readonly: true });
    expect(db.prepare("select count(*) as n from sqlite_master where name = 'Channel'").get()).toEqual({ n: 1 });
    db.close();

    execSync("npx tsx scripts/backup.ts", { env: { ...env, BACKUP_ENCRYPTION_KEY: "a-long-backup-key-123456" }, stdio: "pipe" });
    const enc = readdirSync(dir).find((f) => f.endsWith(".db.enc"))!;
    expect(existsSync(path.join(dir, enc.replace(/\.enc$/, "")))).toBe(false); // plaintext removed
    expect(readFileSync(path.join(dir, enc)).subarray(0, 8).toString()).toBe("MDBKUP01");
  });
});
