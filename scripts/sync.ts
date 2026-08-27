import "dotenv/config";
import { Platform } from "../src/generated/prisma/client";
import { runSync } from "../src/lib/sync";

async function main() {
  const arg = process.argv[2]?.toUpperCase();
  const platform =
    arg && Object.values(Platform).includes(arg as Platform)
      ? (arg as Platform)
      : undefined;

  console.log(
    platform ? `Syncing ${platform}…` : "Syncing all platforms…"
  );
  const results = await runSync(platform);
  for (const r of results) {
    console.log(
      `[${r.status}] ${r.platform}: ${r.message}${r.error ? ` (${r.error})` : ""} — ${r.recordsUpserted} records`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
