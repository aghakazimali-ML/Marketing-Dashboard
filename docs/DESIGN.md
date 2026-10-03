# Design system

## Principles
1. **Honest numbers first.** Empty ≠ zero. Every metric tile can explain itself (source/formula tooltip, "—" with a reason, "Includes …" for totals).
2. **Meaning is never colour-only.** Deltas have arrows and signs; statuses have icons and text; platforms have text labels beside their colour dot.
3. **Every data view has loading, empty and error states** (skeletons → `EmptyState` with a next step → `ErrorState` with Retry).
4. **Accessible by default.** Visible `:focus-visible` rings, skip link, labelled controls, `aria-sort` + buttons in sortable headers, charts with a text summary and "View as table", native `<dialog>` confirmation (focus trap, Esc), `aria-live` toasts, reduced-motion / reduced-transparency support.

## Tokens (`src/app/globals.css`)
No hard-coded colours in components: use the Tailwind theme names backed by CSS variables.
`navy-*`, `teal-*`, `lime`, `electric`, `sand-*`, `ink`, `muted`, `line`, `up`, `down`, `warn`, `surface`, `card`, `on-accent`, `focus`, `platform-{linkedin,facebook,instagram,youtube,website}`, chart colours `--chart-1..4`, `--chart-grid`, `--chart-axis`.
Dark mode: follows the OS; a user can force Light/Dark (user menu / Account). Dark tokens are defined once in `:root[data-theme="dark"]` and the `prefers-color-scheme` block.

Contrast (WCAG AA): body text `ink` on card ≥ 12:1, `muted` ≥ 5:1, `up`/`down` ≥ 5:1 on white, white-on-`teal-600` buttons ≥ 5:1. Use `text-on-accent` (not `text-white`) on accent buttons so dark mode stays readable.

## Components
`MetricCard` (value, delta badge, reason, info, includes) · `DataTable` (nulls sort last) · `TrendChart` / `SimpleBarChart` (table alternative) · `SectionCard`, `LeaderCard`, `InsightPill` · `PlatformBadge` · `states.tsx` (Skeletons, EmptyState, ErrorState) · `UpgradePrompt` · `AuthCard`/`TextField`.
Providers (root layout): theme, toast, confirm dialog, auth (silent refresh every 10 min), date range (URL-synced), entitlements, fetch state.

## Layout
`AppShell` renders chrome only (sidebar, header, range picker). Below `lg` the sidebar becomes a horizontal nav and the account menu moves to the header. Tables scroll inside their card; nothing may scroll the page sideways at 375 px.
