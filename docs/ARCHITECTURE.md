# Architecture

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Recharts · Prisma 7 + SQLite (`better-sqlite3`) · Zod · `jose` · Resend · Stripe.

## Data flow
```
platform APIs ──► connectors (src/lib/sync/*) ──► store.ts (idempotent upserts)
                                                      │
        ChannelDailyMetric / WebsiteDailyMetric / WebsiteBreakdown / Post / PostMetrics
                                                      │
                 src/lib/metrics/aggregate.ts (pure) ◄┘──► queries.ts ──► /api/* ──► UI
```

## Numbers (Phase 1)
- **One row per channel per UTC day** (`ChannelDailyMetric`, unique `(channelId, date)`). Fetching again overwrites that day; fields a connector did not fetch (`undefined`) are left untouched, fields the platform lacks are `null`.
- **Null means "not provided".** Sums skip nulls and return `null` if nothing was reported; UI shows "—" with a reason (*Not connected*, *No data in this period*, *Not provided by <platform>*). Cross-platform totals list the platforms they include.
- **Aggregation rules** (`aggregate.ts`): additive metrics are summed over the range; followers = last known value; new followers = last − value before the range (fallback: reported daily gains); engagement rate = engagement ÷ impressions (**Instagram: ÷ reach**); CTR = clicks ÷ impressions; bounce rate / session duration are session-weighted; average view duration is weighted by views. GA4 "users" is the sum of daily active users (documented in the tooltip).
- Legacy `MetricSnapshot` / `WebsiteSnapshot` tables are kept read-only and are **not** used for totals (their overlapping periods double counted).

## Metric sources
| Platform | API | Metrics |
|---|---|---|
| LinkedIn | `rest/organizationalEntityShareStatistics` (DAY granularity), `organizationalEntityFollowerStatistics`, `networkSizes`, `posts` — header `LinkedIn-Version: 202607` | impressions, unique impressions (reach), clicks, likes, comments, shares, follower gains, followers, posts + per-post stats. Engagement = likes+comments+shares+clicks. |
| Facebook | Graph API v25.0 Page Insights | `page_media_view`, `page_total_media_view_unique`, `page_post_engagements`, `page_daily_follows_unique`; posts with `post_media_view` etc. Retired metrics are never requested; an unsupported metric becomes `null`. |
| Instagram | Graph API v25.0 Account Insights | per-day `views`, `reach`, `likes`, `comments`, `shares`, `saves`, `profile_views`, `profile_links_taps`, `follower_count`; media + Reels insights. Engagement = likes+comments+shares+saves. |
| YouTube | Analytics API v2 (OAuth) + Data API v3 | daily views, watch time, average view duration, subscribers gained/lost, likes/comments/shares, returning viewers (best effort); videos & Shorts. Impressions are not provided. |
| GA4 | Data API v1beta | `date` dimension: activeUsers, sessions, newUsers, bounceRate (×100), averageSessionDuration, `keyEvents`; sources (`sessionDefaultChannelGroup`), landing pages (`landingPagePlusQueryString`). |

API versions live in one constant each (`src/lib/metrics/catalog.ts → API_VERSIONS`). Each connector has mocked-response tests in `tests/connectors.test.ts`.

## Connections & fetching (Phase 2)
`runSync` (src/lib/sync/index.ts): takes a DB lock (`SyncLock`, 15-min TTL) → per channel: resolve token (`credentials.ts`: refresh OAuth tokens, mint GA4 service-account tokens) → connector → mark `ACTIVE` + `lastSuccessAt`, or `NEEDS_RECONNECT` on an auth error (admins emailed once; 7-day expiry warnings). HTTP calls retry with back-off on 429/5xx (`http.ts`). `POST /api/cron/sync` (secret header) runs it daily; `SyncRun.error` stores short summaries, `detail` (admins only) the longer text. Full upstream bodies go to the server log only, with credentials redacted.

## Plans & billing
`src/lib/billing/plans.ts` is the single catalogue. The server resolves the plan (`workspace.ts`: `LICENSE_PLAN` → active Stripe subscription → Free) and gates features (`gateFeature`), limits (channels, seats, history, AI/day) and exports. Stripe webhooks (`/api/billing/webhook`, signature-verified, idempotent via `StripeEvent`) are the only thing that changes the stored plan.

## Directory map
```
src/app/            pages + API routes      src/lib/sync/     connectors, tokens, lock, runner
src/components/     UI + providers          src/lib/metrics/  aggregation, queries, formatting
src/lib/auth/       sessions, accounts      src/lib/billing/  plans, Stripe, workspace
src/lib/security/   rate limit, IP, csv     src/lib/oauth/    provider flows
prisma/             schema + migrations     scripts/          CLI tools (owner, backup, rotate)
tests/              Vitest suites           docs/             this documentation
```
