/**
 * Prepare a new customer installation: one folder with its own .env (fresh random secrets),
 * its own port, its own database volume and its own backups.
 *
 *   npm run provision-client -- --name "Acme Ltd" --domain dash.acme.com [--plan STARTER] [--support-email help@you.com]
 *
 * Optional: put settings shared by every customer (Safepay, Lemon Squeezy, OAuth apps, Resend, your company
 * details) in clients/_shared.env; they are copied into each new client's .env.
 * Output goes to clients/<slug>/ (git-ignored, because it contains secrets).
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const secret = (bytes = 32) => randomBytes(bytes).toString("base64url");

const name = arg("name");
const domain = arg("domain");
if (!name || !domain) {
  console.error('Usage: npm run provision-client -- --name "Acme Ltd" --domain dash.acme.com [--plan FREE|STARTER|PRO|EXCLUSIVE] [--support-email you@example.com] [--dir clients]');
  process.exit(1);
}
const plan = arg("plan")?.toUpperCase();
if (plan && !["FREE", "STARTER", "PRO", "EXCLUSIVE"].includes(plan)) {
  console.error("--plan must be FREE, STARTER, PRO or EXCLUSIVE.");
  process.exit(1);
}
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "client";
const root = path.resolve(arg("dir") ?? "clients");
const dir = path.join(root, slug);
if (existsSync(dir)) {
  console.error(`${dir} already exists. Refusing to overwrite its secrets.`);
  process.exit(1);
}
mkdirSync(path.join(dir, "backups"), { recursive: true });

// Next free local port (each client's app listens on 127.0.0.1:<port>, behind your reverse proxy).
const used = existsSync(root)
  ? readdirSync(root).flatMap((d) => {
      const f = path.join(root, d, ".env");
      const m = existsSync(f) ? /^APP_PORT=(\d+)/m.exec(readFileSync(f, "utf8")) : null;
      return m ? [Number(m[1])] : [];
    })
  : [];
const port = Number(arg("port")) || Math.max(3000, ...used.map((p) => p + 1));

const shared = path.join(root, "_shared.env");
const sharedText = existsSync(shared) ? `\n# ---- shared settings (from clients/_shared.env) ----\n${readFileSync(shared, "utf8").trim()}\n` : "";

const setupToken = secret(24);
const env = `# Installation for ${name}. Generated ${new Date().toISOString()}. KEEP SECRET, BACK UP SECRETS_ENCRYPTION_KEY.
CLIENT_ENV_FILE=${path.join(dir, ".env")}
APP_BASE_URL=https://${domain}
APP_PORT=${port}
BACKUP_DIR=${path.join(dir, "backups")}
POSTGRES_PASSWORD=${secret(24)}
AUTH_SECRET=${secret()}
SECRETS_ENCRYPTION_KEY=${secret()}
SETUP_TOKEN=${setupToken}
CRON_SECRET=${secret()}
TRUST_PROXY=true
COMPANY_NAME=${arg("company") ?? ""}
SUPPORT_EMAIL=${arg("support-email") ?? ""}
${plan ? `LICENSE_PLAN=${plan}   # fixed by you; remove to let the customer buy a plan\n` : "# LICENSE_PLAN=   # set to fix the plan yourself instead of selling it through checkout\n"}${sharedText}`;
writeFileSync(path.join(dir, ".env"), env, { mode: 0o600 });

console.log(`
Created ${dir}/.env

Next steps for ${name}:
  1. DNS: point ${domain} at your server, and add a reverse proxy rule (HTTPS) to 127.0.0.1:${port}.
  2. Start it:
       docker compose --env-file ${dir}/.env -p ${slug} up -d --build
  3. The owner finishes setup at https://${domain}/signup with this one-time setup token:
       ${setupToken}
     (or run: docker compose -p ${slug} exec dashboard npm run create-owner)
  4. Connect their channels on the Pages & Fetch page, then press Fetch All Data.
  5. Back up ${dir}/.env somewhere safe (a lost SECRETS_ENCRYPTION_KEY cannot be recovered).
`);
