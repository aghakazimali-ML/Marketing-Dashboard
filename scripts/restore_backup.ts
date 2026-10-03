/**
 * Restore a backup into DATABASE_URL (replaces existing objects). STOP THE APP FIRST.
 *   npm run restore -- backups/dashboard-….dump[.enc]
 * Requires `pg_restore` (package postgresql-client).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const src = process.argv[2];
const url = process.env.DATABASE_URL ?? "";
if (!src || !existsSync(src)) {
  console.error("Usage: npm run restore -- <backup file>");
  process.exit(1);
}
if (!url.startsWith("postgres")) {
  console.error("DATABASE_URL must be a PostgreSQL URL");
  process.exit(1);
}

let file = src;
let tmp: string | null = null;
if (src.endsWith(".enc")) {
  const secret = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!secret) {
    console.error("BACKUP_ENCRYPTION_KEY is required to restore an encrypted backup");
    process.exit(1);
  }
  const buf = readFileSync(src);
  if (buf.subarray(0, 8).toString() !== "MDBKUP01") throw new Error("Not a dashboard backup file");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), buf.subarray(8, 20));
  decipher.setAuthTag(buf.subarray(20, 36));
  tmp = mkdtempSync(path.join(os.tmpdir(), "restore-"));
  file = path.join(tmp, "backup.dump");
  writeFileSync(file, Buffer.concat([decipher.update(buf.subarray(36)), decipher.final()]), { mode: 0o600 });
}

const res = spawnSync("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", url, file], { encoding: "utf8" });
if (tmp) rmSync(tmp, { recursive: true, force: true });
if (res.error || (res.status ?? 1) > 1) {
  console.error(res.error?.message ?? res.stderr);
  process.exit(1);
}
console.log(`restored ${src} into the configured database`);
