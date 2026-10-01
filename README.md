# Marketing Analytics Dashboard

Reusable single-workspace dashboard for social media and website performance. Configure the displayed product name and connect one team's channels. It does not provide separate tenant accounts or data isolation.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite (append-only metric history)
- Recharts, jsPDF, SheetJS (xlsx)

## Setup

```bash
npm install
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
Set `NEXT_PUBLIC_DASHBOARD_NAME` in `.env` to customize the product name. No demo data is seeded; add your own channels and connect live APIs.
Set a strong `AUTH_SECRET`, then open `/signup` to create the owner account for this installation. The owner is an administrator and can invite teammates from **Team & Access**. Analysts can view dashboards and reports; administrators manage team access, connected channels, and live fetches. Invite links are single-use and expire after seven days. Install a separate copy for each client; this is not a shared multi-tenant service.
For invitation email, set `RESEND_API_KEY`, a verified `INVITE_FROM_EMAIL`, and the public `APP_BASE_URL`. The invite recipient receives the link and the installation owner is CC'd. If email is not configured or the provider rejects it, the admin screen provides the one-time link to share manually.
Administrators can configure OpenAI, Anthropic (Claude), xAI (Grok), or Google (Gemini) on **AI Insights**. Each provider uses its own API key and model; keys are encrypted in the local database. When insights are generated, only selected-period aggregate social and website metrics are sent to the selected provider; post text and platform credentials are not included. Usage is billed to the account that owns the selected provider key.
`npm run db:clear-data` permanently removes analytics, channels, team accounts, invitations, and saved AI settings while preserving the owner login and `.env`. Use only when intentionally starting the installation data over.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js |
| `npm run db:clear-data` | Clear stored analytics, channels, team accounts, invites, and AI settings; keep owner login |
| `npm run sync` | Run API sync (all platforms or `npm run sync -- LINKEDIN`) |

## Pages

- `/` Executive Overview
- `/linkedin` LinkedIn comparison
- `/linkedin/battleboard` Ranked LinkedIn leaders
- `/facebook` `/instagram` `/youtube` `/website`
- `/posts` Cross-platform post performance
- `/reports` PDF / Excel / CSV export
- `/insights` AI-generated channel recommendations
- `/team` Admin-managed company accounts and invitations
- `/sync` Manual API synchronization

## Fetch live data

1. Add API tokens to `.env` (see `.env.example`).
2. Set each channel’s external ID (page / org / channel / GA4 property ID).
3. Restart `npm run dev`.
4. Click **Fetch All Data** in the header or open **Pages & Fetch**.

Configured platforms pull live metrics. Unconfigured platforms are marked **Not configured** and skipped without writing synthetic data. Every successful fetch is **append-only** — history is never overwritten. Rolling date ranges advance automatically at local midnight; metric data itself is updated when an administrator runs a fetch.
