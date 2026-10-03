/**
 * Consistent PostgreSQL backup using pg_dump (custom format, safe while the app runs).
 *   npm run backup                          -> backups/dashboard-<timestamp>.dump
 *   BACKUP_ENCRYPTION_KEY=… npm run backup  -> also encrypts (AES-256-GCM) to .dump.enc and removes the plain copy
 *   BACKUP_KEEP=14 npm run backup           -> keep only the newest 14 backups
 * Requires the `pg_dump` binary (package postgresql-client). Restore: `npm run restore -- <file>`.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Output format: MAGIC(8) | iv(12) | tag(16) | ciphertext */
export function encryptBuffer(plain: Buffer, secret: string) {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from("MDBKUP01"), iv, cipher.getAuthTag(), data]);
}

function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw new Error("DATABASE_URL must be a PostgreSQL URL");
  const dir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(dir, `dashboard-${stamp}.dump`);

  const res = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--file", target, url], { encoding: "utf8" });
  if (res.error) throw new Error(`pg_dump not found: install postgresql-client (${res.error.message})`);
  if (res.status !== 0) throw new Error(`pg_dump failed: ${res.stderr.replace(/postgres(ql)?:\/\/\S+/g, "postgresql://***")}`);

  let finalPath = target;
  const secret = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (secret) {
    if (secret.length < 16) throw new Error("BACKUP_ENCRYPTION_KEY must be at least 16 characters");
    finalPath = `${target}.enc`;
    writeFileSync(finalPath, encryptBuffer(readFileSync(target), secret), { mode: 0o600 });
    rmSync(target);
  }

  const keep = Number(process.env.BACKUP_KEEP ?? 0);
  if (keep > 0) {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith("dashboard-"))
      .map((f) => ({ f, t: statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const old of files.slice(keep)) rmSync(path.join(dir, old.f));
  }
  console.log(`backup written: ${finalPath}`);
}

if (process.argv[1]?.endsWith("backup.ts")) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
