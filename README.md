# Marketing Analytics Dashboard

A self-hostable analytics dashboard for marketing teams: LinkedIn, Facebook, Instagram, YouTube and Google Analytics 4 in one place, with reports (CSV / Excel / PDF), AI insights, team access and subscription plans.

**Deployment model:** one installation per customer (single workspace, not multi-tenant). Plans (Free / Starter / Pro / Exclusive) are enforced per installation and can be bought through Stripe or fixed by the operator with `LICENSE_PLAN`.

## Highlights

- **Correct numbers.** Every platform metric is stored per day and re-fetching overwrites, so totals never double count. Missing data is `null` and shown as "—", never as 0. No estimates (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).
- **Real integrations.** LinkedIn (versioned REST API), Meta Graph v25, YouTube Analytics API, GA4 Data API. One-click OAuth, service-account GA4, automatic token refresh, "Needs reconnect" alerts and a locked, scheduled daily fetch.
- **Secure by default.** scrypt passwords, encrypted tokens with key rotation, session revocation, login lockout, strict nonce-based CSP, audit log, CSRF origin checks. See [docs/SECURITY.md](docs/SECURITY.md).
- **Plans.** Free, Starter, Pro, Exclusive; limits and features enforced on the server. Stripe Checkout, billing portal and webhooks included.

| | Free | Starter | Pro | Exclusive |
|---|---|---|---|---|
| Channels / users / history | 3 / 1 / 30 d | 8 / 3 / 90 d | 25 / 10 / 12 mo | unlimited |
| Daily auto-fetch, Excel & PDF, comparison, custom ranges, posts, raw export | – | ✓ | ✓ | ✓ |
| AI insights, Battleboard, audit log, scheduled email reports | – | – | ✓ | ✓ |
| REST API keys, white-label branding | – | – | – | ✓ |

## Quick start (development)

```bash
npm install
cp .env.example .env        # set AUTH_SECRET, SECRETS_ENCRYPTION_KEY, SETUP_TOKEN
npx prisma migrate deploy   # creates prisma/dev.db
npm run dev                 # http://localhost:3000  → /signup (needs SETUP_TOKEN) or `npm run create-owner`
```

## Install with Docker

```bash
cp .env.example .env        # fill in secrets, APP_BASE_URL=https://dashboard.example.com, TRUST_PROXY=true
docker compose up -d --build
```

The container applies migrations and encrypts any legacy plaintext credentials on every start, stores the database in the `dashboard-data` volume, and exposes `/api/health`. Put a TLS reverse proxy (Caddy, nginx, Traefik) in front of `127.0.0.1:3000`. The bundled `scheduler` service calls the daily fetch and report endpoints; remove it if you use host cron.

## Install on a plain server

```bash
git clone <repo> && cd marketing-dashboard && npm ci
cp .env.example .env && $EDITOR .env
npx prisma migrate deploy
npm run build
npm run create-owner -- --email you@company.com --name "You"
NODE_ENV=production npm start      # or node .next/standalone/server.js behind systemd / pm2
```

Schedule the daily jobs (host cron):

```cron
15 6 * * *  curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://dashboard.example.com/api/cron/sync
30 6 * * *  curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://dashboard.example.com/api/cron/reports
45 2 * * *  cd /opt/dashboard && BACKUP_KEEP=14 npm run backup
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest (uses a throwaway SQLite database) |
| `npm run lint`, `npm run typecheck` | static checks |
| `npm run create-owner` | create the first owner from the CLI |
| `npm run sync [-- LINKEDIN]` | run a fetch from the CLI |
| `npm run rotate-secrets` | encrypt plaintext / re-encrypt credentials with the current key |
| `npm run backup` / `restore -- <file>` | online SQLite backup (optionally encrypted) / restore |
| `npm run db:clear-data` | wipe analytics, channels, team and AI settings (keeps the owner) |

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md) · [Production & operations](docs/PRODUCTION.md) · [Design system](docs/DESIGN.md) · [API access setup](docs/SETUP_API_ACCESS.md) · [Privacy](docs/PRIVACY.md) · [Changelog](docs/CHANGELOG.md) · [Licence](LICENSE)
