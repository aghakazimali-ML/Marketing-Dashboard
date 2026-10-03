/**
 * Decrypt (if needed) and restore a backup. STOP THE APP FIRST.
 *   npm run restore -- backups/dashboard-….db[.enc]
 */
import "dotenv/config";
import { createDecipheriv, createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
const url = process.env.DATABASE_URL ?? "";
if (!src || !existsSync(src)) {
  console.error("Usage: npm run restore -- <backup file>");
  process.exit(1);
}
if (!url.startsWith("file:")) {
  console.error("DATABASE_URL must be a SQLite file: URL");
  process.exit(1);
}
const dest = url.slice("file:".length);
if (existsSync(dest)) copyFileSync(dest, `${dest}.pre-restore`);

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
  writeFileSync(dest, Buffer.concat([decipher.update(buf.subarray(36)), decipher.final()]), { mode: 0o600 });
} else {
  copyFileSync(src, dest);
}
console.log(`restored ${src} -> ${dest} (previous database saved as ${dest}.pre-restore)`);
