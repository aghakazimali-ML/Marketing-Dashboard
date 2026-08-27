# NETS Marketing Performance Dashboard

Internal dashboard for the **NETS International Marketing Department** — not a multi-tenant SaaS product.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite (append-only metric history)
- Recharts, jsPDF, SheetJS (xlsx)

## Setup

```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js |
| `npm run db:seed` | Seed NETS channels + multi-month metrics |
| `npm run db:reset` | Reset DB and reseed |
| `npm run sync` | Run API sync (all platforms or `npm run sync -- LINKEDIN`) |

## Pages

- `/` Executive Overview
- `/linkedin` LinkedIn comparison
- `/linkedin/battleboard` Ranked LinkedIn leaders
- `/facebook` `/instagram` `/youtube` `/website`
- `/posts` Cross-platform post performance
- `/reports` PDF / Excel / CSV export
- `/sync` Manual API synchronization

## Fetch live data

1. Add API tokens to `.env` (see `.env.example`).
2. Keep `SYNC_MOCK=false`.
3. Set each Channel’s `externalId` (page / org / channel / GA4 property IDs).
4. Restart `npm run dev`.
5. Click **Fetch All Data** in the header (or open **Fetch Data** in the sidebar).

Connected platforms pull live metrics; platforms without tokens still append demo snapshots so the UI keeps working. Every fetch is **append-only** — history is never overwritten.
