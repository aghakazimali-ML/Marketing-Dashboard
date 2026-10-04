# Marketing Analytics Dashboard

A self-hostable SaaS-style analytics product for marketing teams, **built for the Pakistani market**: LinkedIn, Facebook, Instagram, YouTube and Google Analytics 4 in one place, with reports (CSV / Excel / PDF), AI insights, team access, and Free / Starter / Pro / Exclusive plans. **Pakistan pays in PKR through Safepay; international customers pay in USD through Lemon Squeezy.** The country is detected automatically from the visitor's IP: nobody is asked to pick one.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Recharts · **PostgreSQL** (Prisma 7 + `pg`) · Zod · **Safepay** (Pakistan) + **Lemon Squeezy** (international) · Resend.
**Deployment model:** one installation (and one PostgreSQL database) per customer; plans are enforced per installation.

## Plans

| | Free | Starter | Pro | Exclusive |
|---|---|---|---|---|
| Price in Pakistan (PKR) | Rs 0 | Rs 1,900 / month | Rs 5,250 / month *(special offer, was Rs 7,500)* | Rs 9,600 / month *(special offer, was Rs 14,000)* |
| Yearly, PKR (2 months free) | – | Rs 19,000 | Rs 52,500 | Rs 96,000 |
| International (USD) | $0 | $7 / month · $70 / year | $19 / month · $190 / year | $35 / month · $350 / year |
| Channels / users / history | 3 / 1 / 30 d | 8 / 3 / 90 d | 25 / 10 / 12 mo | unlimited |
| Daily auto-fetch, Excel & PDF, comparison, custom ranges, posts, raw export | – | ✓ | ✓ | ✓ |
| AI insights, Battleboard, audit-log viewer, scheduled email reports | – | – | ✓ | ✓ |
| REST API keys, white-label product name | – | – | – | ✓ |

Limits, features and prices live in `src/lib/billing/plans.ts` (the single catalogue; edit the PKR and USD prices there) and are enforced on the server. Customers pay through Safepay (Pakistan) or Lemon Squeezy (everywhere else); the operator can instead fix a plan with `LICENSE_PLAN`.

## Selling this product: one installation per customer

Each customer gets **their own copy** of the app and **their own PostgreSQL database** (their own folder, port and secrets). Customers never share data, and a problem at one customer cannot affect another. You, the operator, run the copies on your server(s).

Set up a new customer in a few minutes:

```bash
npm run provision-client -- --name "Acme Ltd" --domain dash.acme.com --support-email help@yourcompany.com
# creates clients/acme-ltd/.env with fresh random secrets, then prints the exact next steps:
docker compose --env-file clients/acme-ltd/.env -p acme-ltd up -d --build
```

- Put settings shared by every customer (your Safepay and Lemon Squeezy keys, Google/Meta/LinkedIn OAuth apps, Resend key, `COMPANY_NAME`, `COMPANY_ADDRESS`) in `clients/_shared.env`; they are copied into each new customer's `.env`.
- Add `--plan EXCLUSIVE` (or STARTER/PRO) to fix a customer's plan yourself, for example for an invoiced customer. Leave it out to let them buy a plan at checkout.
- Point the customer's domain at your server and add an HTTPS reverse-proxy rule to the port the script prints. Then give the owner the setup token so they can create their account at `/signup`.
- `clients/` is git-ignored because it contains secrets. Back up each `.env` (a lost `SECRETS_ENCRYPTION_KEY` cannot be recovered) and each customer's database (`npm run backup`).

## Legal pages

`/terms`, `/privacy` and `/refund-policy` are public pages, linked from the sign-in screens and the billing page. They fill in your business details from `COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_COUNTRY` (default Pakistan, also used as the governing law), `SUPPORT_EMAIL`, `LEGAL_EFFECTIVE_DATE` and `REFUND_WINDOW_DAYS` (default 7). The text is a sensible starting template that matches how this product works (Safepay and Lemon Squeezy, encrypted credentials, AI providers). **Have a lawyer review it for your company and jurisdiction before selling.**

## Go-live checklist

- [ ] `COMPANY_NAME`, `SUPPORT_EMAIL` and the legal text reviewed by a lawyer; placeholder `LICENSE` replaced
- [ ] Google, Meta and LinkedIn apps created and approved (Meta and LinkedIn need app review; apply early)
- [ ] Safepay sandbox tested end to end, `SAFEPAY_AMOUNT_UNIT` confirmed, then `SAFEPAY_ENVIRONMENT=production`
- [ ] Lemon Squeezy store, six variants ($7/$19/$35 monthly and $70/$190/$350 yearly) and webhook set up and tested in test mode
- [ ] Resend domain verified (invitations, password resets, scheduled reports)
- [ ] HTTPS domain, reverse proxy and firewall; `TRUST_PROXY=true`
- [ ] Docker image built and started; `/api/health` returns OK
- [ ] Daily backup scheduled and a restore tested
- [ ] Uptime monitoring on `/api/health`
- [ ] One real pilot customer connected and fetched successfully

## Quick start (development)

```bash
# 1. PostgreSQL (any 14+). Example with Docker:
docker run -d --name dash-pg -e POSTGRES_USER=dash -e POSTGRES_PASSWORD=dash -e POSTGRES_DB=dashboard -p 5432:5432 postgres:16

# 2. App
npm install
cp .env.example .env     # set DATABASE_URL, AUTH_SECRET, SECRETS_ENCRYPTION_KEY, SETUP_TOKEN
npx prisma migrate deploy
npm run dev              # http://localhost:3000 -> /signup (enter SETUP_TOKEN) or: npm run create-owner
```

Generate secrets with `openssl rand -base64 48`.

## Deploy with Docker (app + PostgreSQL)

```bash
cp .env.example .env     # fill in secrets, POSTGRES_PASSWORD, APP_BASE_URL=https://dashboard.example.com
docker compose up -d --build
docker compose logs -f dashboard   # migrations run on start; then GET /api/health
```

The compose file runs `postgres:16` (not published to the host, data in a named volume), the app (migrations + credential encryption on every start, non-root, health-checked) and an optional `scheduler` that calls the daily fetch and report endpoints. Put a TLS reverse proxy (Caddy / nginx / Traefik) in front of `127.0.0.1:3000` and set `TRUST_PROXY=true`.

## Deploy on a plain server

```bash
git clone <repo> && cd Marketing-Dashboard && npm ci
cp .env.example .env && $EDITOR .env     # DATABASE_URL -> your PostgreSQL
npx prisma migrate deploy && npm run build
npm run create-owner -- --email you@company.com --name "You"
NODE_ENV=production node .next/standalone/server.js     # behind systemd / pm2 + TLS proxy
```

Schedule the daily jobs (host cron):

```cron
15 6 * * *  curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://dashboard.example.com/api/cron/sync
30 6 * * *  curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://dashboard.example.com/api/cron/reports
45 2 * * *  cd /opt/dashboard && BACKUP_KEEP=14 npm run backup
```

Production refuses to start with weak or missing secrets, a non-PostgreSQL `DATABASE_URL`, or a non-https `APP_BASE_URL`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest against a throwaway PostgreSQL database (`TEST_DATABASE_URL`, default `postgresql://dash:dash@127.0.0.1:5432/dashboard_test`; its schema is recreated each run) |
| `npm run lint`, `npm run typecheck` | static checks |
| `npm run create-owner` | create the first owner from the CLI |
| `npm run sync [-- LINKEDIN]` | run a fetch from the CLI |
| `npm run rotate-secrets` | encrypt plaintext / re-encrypt credentials with the current key |
| `npm run backup` / `restore -- <file>` | `pg_dump` backup (optionally AES-encrypted) / restore (needs `postgresql-client`) |
| `npm run db:clear-data` | wipe analytics, channels, team and AI settings (keeps the owner) |

## How the numbers work

- **One row per channel per UTC day** (`ChannelDailyMetric`, unique `(channelId, date)`); fetching again overwrites that day, so totals never double count. Fields a connector didn't fetch are left alone; fields a platform doesn't provide are `null`.
- **`null` means "not provided"** and shows as "—" with a reason; cross-platform totals say which platforms they include. No estimates are ever stored.
- **Aggregation:** additive metrics are summed; followers = last known value; new followers = last − value before the range (fallback: reported daily gains); engagement rate = engagement ÷ impressions (Instagram: ÷ reach); bounce rate and session duration are session-weighted; GA4 "users" is the sum of daily active users.
- **Sources:** LinkedIn versioned REST API (`202607`, DAY granularity), Meta Graph API `v25.0` (current *views / media view* metrics), YouTube Analytics API v2 + Data API v3, GA4 Data API (`keyEvents`). Versions live in `src/lib/metrics/catalog.ts`.
- **Fetching:** a database lock prevents overlapping runs; 429/5xx retry with back-off; an auth error marks the channel **Needs reconnect** and emails admins (also 7 days before a known expiry).

## Connecting your channels

Use **Connect** next to a channel on *Pages & Fetch* (needs the OAuth app below), or paste credentials under **Advanced**. Redirect URIs to register: `{APP_BASE_URL}/api/oauth/{google|meta|linkedin}/callback`.

- **GA4 (recommended: service account):** create a service account + JSON key, enable the *Google Analytics Data API*, add the account's email as **Viewer** on the property, then paste the JSON under *Advanced* on a Website channel with the numeric property ID.
- **YouTube:** enable *YouTube Data API v3* and *YouTube Analytics API*, create an OAuth client (`GOOGLE_CLIENT_ID/SECRET`), add the channel ID (`UC…`) and press *Connect with Google*. An API key alone only returns the subscriber count.
- **Facebook / Instagram:** create a Meta app (`META_APP_ID/SECRET`), use the Page ID / Instagram Business account ID, press *Connect with Meta*. Needs `pages_show_list`, `pages_read_engagement`, `read_insights`, `instagram_basic`, `instagram_manage_insights` (App Review for use beyond your own accounts). Instagram insights need ≥ 100 followers and ~30 days of daily history.
- **LinkedIn:** request the *Community Management API*, set `LINKEDIN_CLIENT_ID/SECRET`, enter the organization ID, press *Connect with LinkedIn* as a page admin. Refresh tokens are only issued to approved partners; otherwise reconnect when the token expires (you're emailed first).

## Security

scrypt passwords (12+ chars) · login rate limits per IP **and** email with a 10-failure lockout · `SETUP_TOKEN` (or the CLI) to create the first owner · sessions revocable via `sessionVersion` (password change/reset, role change, disable) with 1 h tokens silently refreshed up to 12 h · forgot/reset password with single-use hashed 30-minute tokens · API tokens encrypted (AES-256-GCM, key id, rotation via `SECRETS_ENCRYPTION_KEY_PREVIOUS` + `npm run rotate-secrets`) · per-request nonce CSP, HSTS and other headers · `Origin` check on mutating requests · signed idempotent Safepay / Lemon Squeezy webhooks and redirects (server-side pricing, amount-mismatch rejection) · constant-time secret checks · API keys stored as hashes · audit log of logins, invites, role changes, credential/billing changes and fetches · structured JSON logs with credentials redacted · production config validation. Set `TRUST_PROXY=true` only behind a proxy that overwrites `X-Forwarded-For`, and back up `SECRETS_ENCRYPTION_KEY` (without it stored tokens can't be decrypted).

## Operations

- **Backups:** `npm run backup` → `backups/dashboard-<timestamp>.dump` (`BACKUP_ENCRYPTION_KEY` encrypts, `BACKUP_KEEP=N` prunes). **Restore:** stop the app, `npm run restore -- <file>`, start the app. Also keep `.env`.
- **Key rotation:** set the new `SECRETS_ENCRYPTION_KEY`, move the old one to `SECRETS_ENCRYPTION_KEY_PREVIOUS`, run `npm run rotate-secrets`, then drop the old key.
- **Billing with Safepay (Pakistan):** create a merchant account at getsafepay.com, then in the dashboard copy the **API key**, the **v1 secret key** and the **webhook shared secret** into `SAFEPAY_API_KEY`, `SAFEPAY_SECRET_KEY`, `SAFEPAY_WEBHOOK_SECRET`, and register the webhook `https://<your-domain>/api/billing/safepay/webhook`. Keep `SAFEPAY_ENVIRONMENT=sandbox` while testing (no real money moves) and switch to `production` to go live. How it works: an admin picks a plan on *Plan & Billing* → the server computes the PKR price (clients cannot set amounts) → Safepay checkout (cards and the local methods enabled on your Safepay account) → the customer is redirected back and Safepay also calls the webhook; both are signature-verified and whichever arrives first activates the plan **exactly once**. Payments are **prepaid periods** (1 month or 12 months): renewing the same plan stacks onto the remaining time, upgrading credits the unused days, a lower plan can be chosen after the period ends, and when a period ends the workspace falls back to Free (data is kept, paid features lock). Admins are emailed 7 days before expiry (sent by the daily `/api/cron/reports` call) and see a payment history on the billing page. **Before going live, run one sandbox payment and confirm the amount on the Safepay page equals the price shown here;** if it is 100× off, set `SAFEPAY_AMOUNT_UNIT=minor`.
- **Billing with Lemon Squeezy (international, USD):** create a store at lemonsqueezy.com, create one subscription product per plan with a monthly and a yearly variant priced like the USD table above, then set `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET` and the six `LEMONSQUEEZY_VARIANT_*` ids. Add a webhook to `https://<your-domain>/api/billing/lemonsqueezy/webhook` (signing secret = `LEMONSQUEEZY_WEBHOOK_SECRET`, events listed in `.env.example`). Lemon Squeezy is the merchant of record, so it handles VAT/sales tax and the customer portal (card, invoices, cancel; opened from **Manage subscription**). The app mirrors the subscription state from signed webhooks: active / trial / past-due keep access, a cancelled subscription keeps access until its end date, expired or paused falls back to Free; older or duplicate events are ignored. Use `LEMONSQUEEZY_TEST_MODE=true` with a test-mode key while testing. The app never trusts the browser for prices or variants.
- **Which gateway a customer sees (automatic country detection):** the server decides from the visitor's IP: Pakistan → Safepay (PKR), any other country → Lemon Squeezy (USD). Order of detection: CDN country headers (`CF-IPCountry`, `X-Vercel-IP-Country`, `CloudFront-Viewer-Country`) when `TRUST_PROXY=true`, then an IP-geolocation API (default `https://ipwho.is/{ip}`, free, no key; set `GEOIP_URL`/`GEOIP_API_KEY` for another provider), cached for 24 hours. If the country cannot be determined (local/private address, API down) the operator default `DEFAULT_BILLING_REGION` applies (PK unless changed). A workspace that already pays through one gateway stays on it (a traveling admin is never switched), and checkout endpoints re-check the region on the server, so changing a header or parameter in the browser has no effect. The visitor's IP is sent to the geolocation provider; behind Cloudflare or a similar CDN no external call is needed. A VPN can still make a visitor look like they are in another country; that is inherent to IP-based detection.
- **Migrations:** `npx prisma migrate dev --name …` in development, `npx prisma migrate deploy` in production; never `db push` a shipped schema. This repository starts from a single PostgreSQL baseline migration (an earlier SQLite prototype is not migrated automatically).

## Data & privacy

Stored: team accounts (scrypt hashes), encrypted channel credentials, daily platform metrics, posts and their metrics, GA4 aggregates, audit log, subscription IDs. Card data never touches the app (Safepay / Lemon Squeezy collect it); we store only order numbers, amounts and statuses. Sent out: aggregate selected-period metrics to the configured AI provider (never post text or credentials), email content to Resend, API calls to the platforms, visitor IP to the geolocation provider (not needed behind a CDN that supplies the country); order amount and our order number to Safepay; admin email and plan choice to Lemon Squeezy. Removing a channel deletes its data; `npm run db:clear-data` wipes everything except the owner.

## Licence

Commercial placeholder in [LICENSE](LICENSE): replace it with your own agreement before selling.
