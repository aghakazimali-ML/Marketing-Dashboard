# Production & operations

## Checklist
- [ ] `.env` filled in: `AUTH_SECRET`, `SECRETS_ENCRYPTION_KEY` (32+ chars each), `APP_BASE_URL=https://…`, `CRON_SECRET`, `SETUP_TOKEN`, `TRUST_PROXY=true` behind a proxy.
- [ ] TLS reverse proxy in front (HSTS is sent by the app).
- [ ] Persistent volume for `DATABASE_URL` (Docker: `/data`).
- [ ] Owner created (`/signup` with `SETUP_TOKEN`, or `npm run create-owner`).
- [ ] Daily jobs scheduled: fetch, report digest, backup.
- [ ] Email configured (Resend) for invites, password reset, reconnect alerts.
- [ ] `/api/health` monitored.

## Docker
`docker compose up -d --build`. The entrypoint runs `prisma migrate deploy` and `rotate-secrets` before starting. Image: multi-stage, Node 22, non-root, health-checked. *Note: the Docker build itself could not be run in the authoring environment (no daemon); the entrypoint sequence and standalone layout were exercised manually.*

## Migrations
All schema changes are Prisma migrations (`npx prisma migrate dev --name …` in development, `migrate deploy` in production). Never `db push` a shipped schema. The `daily_metrics_and_connections` migration discards the old per-period `PostMetrics` rows (no connector ever wrote them) and keeps `MetricSnapshot`/`WebsiteSnapshot` as read-only history.

## Scheduling
```
POST /api/cron/sync     header x-cron-secret: $CRON_SECRET   # daily; 409 if a fetch is already running
POST /api/cron/reports  header x-cron-secret: $CRON_SECRET   # daily; sends the digest only when due
```
Both honour the plan (no auto-fetch on Free; digests need Pro).

## Backups & restore
`npm run backup` uses SQLite's online backup (safe while running) → `backups/dashboard-<timestamp>.db`. `BACKUP_ENCRYPTION_KEY` encrypts it (AES-256-GCM, `.db.enc`); `BACKUP_KEEP=N` prunes. Copy backups off the machine.
Restore: stop the app → `npm run restore -- backups/dashboard-….db[.enc]` (the old file is kept as `*.pre-restore`) → start the app. Also back up `.env` (especially `SECRETS_ENCRYPTION_KEY`).

## Key rotation
1. Set `SECRETS_ENCRYPTION_KEY_PREVIOUS=<old>` and `SECRETS_ENCRYPTION_KEY=<new>`.
2. `npm run rotate-secrets`.
3. Remove the old key. To rotate `AUTH_SECRET`, change it (everyone is signed out).

## Billing
Create three products with monthly + yearly prices in Stripe, put the price IDs in `STRIPE_PRICE_*`, add the webhook endpoint `…/api/billing/webhook` (events listed in `.env.example`), and set `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`. For installations you host for customers, give each its own subscription via your Stripe account; for self-managed licences set `LICENSE_PLAN` instead. Displayed prices are in `src/lib/billing/plans.ts`.

## Observability
JSON logs on stdout (`LOG_LEVEL`). Useful fields: `msg`, `level`, `channelId`, `platform`, `status`. Never contain tokens.

## Verification status
Verified in the authoring environment: lint, type-check, 70+ unit/integration tests, production build, a running production build (auth flow, headers/CSP, plan gating, lockout, cron, cross-site block) and screenshots at 1280 px and 375 px. **Not verifiable without credentials:** live LinkedIn/Meta/YouTube/GA4 calls, OAuth round trips, Stripe checkout/webhooks, Resend delivery, Docker image build.
