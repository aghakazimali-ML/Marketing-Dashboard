# Changelog

## Unreleased: production-readiness + plans

### Phase 0 — tooling
- Next.js 16.3.8 (SEC-1, B6); `npm audit --omit=dev` clean (overrides pin patched transitive packages `uuid`, `deepmerge-ts`, `mysql2`; `prisma` and `tsx` moved to runtime dependencies because the container runs migrations and scripts).
- Vitest with a throwaway SQLite DB; GitHub Actions: install → generate → lint → typecheck → test → build → audit.
- Removed dead files (`scripts/add_pages.ts`, `favicon.ic`, `picsum` image pattern, `skills-lock.json`).

### Phase 1 — correct numbers
- **B1** New `ChannelDailyMetric`, `WebsiteDailyMetric`, `WebsiteBreakdown`; idempotent per-day upserts; new aggregation rules. Test: three consecutive fetches leave totals unchanged.
- **B2** Removed `reach = impressions × 0.75/0.7` and `impressions = lifetime views`; Instagram ER = engagement ÷ reach; YouTube uses the Analytics API for period values; LinkedIn uses DAY-granular time-bound statistics (engagement count = likes+comments+shares+clicks, not LinkedIn's rate field); GA4 bounce rate is always ×100.
- **UX-3** Metrics are nullable end to end; "—" with a reason; totals state which platforms they include.
- **Migration notes:** old `MetricSnapshot`/`WebsiteSnapshot` rows are kept read-only and no longer used (they cannot be converted reliably). Old `PostMetrics` rows were discarded (never written by any connector).

### Phase 2 — integrations
- **B3** LinkedIn `202607`, Meta Graph `v25.0` (current *views/media view* metrics, tokens in headers), GA4 `keyEvents`, YouTube Analytics v2; constants in `catalog.ts`.
- **B4** Posts and per-post metrics for all four social platforms, GA4 sources + landing pages, YouTube watch time / average view duration; every active channel is synced.
- **B5** OAuth Connect (Google, Meta, LinkedIn), GA4 service accounts, auto refresh, `NEEDS_RECONNECT` + emails (+7-day expiry warning), `POST /api/cron/sync`, DB lock, retry with back-off.

### Phase 3 — security
SEC-2…SEC-14 implemented; see `docs/SECURITY.md`. Also added: Origin check on mutating calls, nonce CSP, `create-owner` CLI, `rotate-secrets`.

### Phase 4 — UI/UX
Providers in the root layout; URL-synced date range; sign-out + user menu; 401 → login with "session expired"; silent refresh; skeleton/empty/error states; delta badges; toasts with per-platform results; server-side "data updated"; configurable overview chart; accessible confirm dialog; validated custom range; connection badges + Connect/Reconnect/Fetch now; first-run checklist; WCAG-oriented fixes (labels, `aria-sort`, chart table view, focus rings, reduced motion/transparency); dark mode tokens; platform badges.

### Phase 5 — operations
Dockerfile (multi-stage, non-root, healthcheck), compose, `backup`/`restore` scripts, Zod config validation at start-up (`src/instrumentation.ts`), JSON logging with redaction, docs, licence placeholder, privacy template.

### Phase 6 — plans & billing (added beyond the original brief)
Free / Starter / Pro / Exclusive with server-side enforcement, Stripe Checkout + billing portal + signed idempotent webhooks, operator `LICENSE_PLAN`, API keys + REST API (Exclusive), white-label name (Exclusive), scheduled email digests (Pro+), raw daily-data export (Starter+).

### Decisions made where the brief was ambiguous
- **Single-tenant per installation** is kept (as in the brief). The earlier "SaaS" request is met by plans/billing per installation, not by multi-tenancy.
- **SQLite stays** (as in the brief): WAL-capable, online backups, migrations. Moving to PostgreSQL would be a deliberate follow-up (provider switch + driver adapter).
- **Source documents:** the `docs/` files referenced by the brief were not available in the repo, so these docs were written from the brief's issue list.
- Followers are only known from the first fetch onward (platforms expose the current count); "new followers" falls back to API-reported daily gains until a baseline exists.
- GA4 "users" is the sum of daily active users (documented in the UI) — GA4 cannot add unique users across days.
- Facebook page-level likes/comments/shares are not provided by the current Page Insights metrics, so those tiles are omitted rather than faked.
- YouTube "returning viewers" is requested best-effort; if the API rejects it the value stays `null`.
- Free-plan `scheduledFetch` is off: the cron endpoint answers `skipped`.
