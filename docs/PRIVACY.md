# Privacy notice template

*Adapt this template to your organisation and obtain legal review before use.*

## What this application stores
| Data | Where | Purpose |
|---|---|---|
| Team accounts: name, email, role, password hash (scrypt), session version | database | sign-in and access control |
| Invitations and password-reset tokens (hashed) | database | onboarding / recovery |
| Channel settings and **API tokens / OAuth refresh tokens** (AES-256-GCM encrypted) | database | fetching analytics |
| Daily platform metrics, posts (titles, text excerpts, links, thumbnails URLs) and their metrics | database | dashboards and reports |
| Website analytics aggregates (sessions, sources, landing pages) | database | dashboards |
| Audit log: actor email, action, target, IP, time | database | security accountability |
| Subscription state: Stripe customer/subscription IDs, plan | database | billing (card data never touches this app; Stripe stores it) |
| Server logs | stdout | operations (credentials redacted) |

## What leaves the installation
- **AI providers** (OpenAI, Anthropic, xAI, Google — only if an administrator configures one): selected-period **aggregate** metrics per channel (counts and rates, channel names). Post text, credentials and personal data are not sent. Usage is billed to the provider account that owns the key.
- **Resend** (if configured): recipient email, subject and body of invitations, reset links, alerts and report digests.
- **Platform APIs** (LinkedIn, Meta, Google, YouTube): requests carrying your tokens.
- **Stripe** (if configured): admin email and plan selection.

## Retention and deletion
Metrics are kept until a channel is removed (cascade delete) or `npm run db:clear-data` is run. Audit entries are kept until the database is cleared; add a retention job if your policy requires one. Backups follow your backup retention (`BACKUP_KEEP`).

## Controller / contact
`<your company, address, privacy contact>`
