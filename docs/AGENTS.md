# Development Principles
Follow KISS, YAGNI, and DRY. Don't add unnecessary code. Reuse existing codebase.

# Tech Stack

## Frontend
- Svelte 4 syntax (not Svelte 5)
- daisyui + tailwindcss for styling
  - White text: `text-base-100`
  - Black text: `text-base-content`
  - White bg: `bg-base-100`
  - Black bg: `bg-base-content`
  - Gray: `bg-base-content/60` or `bg-base-300`
  - Avoid custom colors like `text-gray-900`
  - Use `capitalize` instead of `uppercase`
  - Use `<span>` with tailwind classes instead of `<h1>`, `<p>`
- svelte-i18n with `$_` for text, en.json is default

## Backend
- bignumber.js for numeric calculations
- getRFC3339Timestamp() for string timestamps

# Frontend Directory Conventions

The frontend lives in `interface/src/`. Follow these rules when adding or moving files:

## Routes / Pages (`interface/src/routes/`)

- Pages go in `routes/` following SvelteKit file-based routing
- Two top-level route groups:
  - `(bottomNav)/` — main app sections with bottom navigation (home, market, spot, swap, wallet, market-making, admin)
  - `(secondary)/` — secondary screens without bottom nav
- Each page is a `+page.svelte` inside its route directory
- Page-specific components that are NOT reusable across pages go in a `components/` folder **next to** the `+page.svelte` that uses them

## Shared Components (`interface/src/lib/components/`)

- Components reusable across multiple pages go here, organized by feature:
  - `common/` — generic UI (loading, exchange icon, connect wallet btn, etc.)
  - `admin/`, `home/`, `market/`, `spot/`, `swap/`, `wallet/`, `market-making/`, `grow/` — feature-specific
  - `topBar/`, `bottomNav/` — navigation components
  - `dialogs/` — shared dialog/modal components
  - `skeleton/` — loading skeleton components
- Rule of thumb: if a component is used by only one page, keep it in the page's `components/` folder. If reused, move it to `lib/components/`.

## Stores (`interface/src/lib/stores/`)

- Svelte stores for state management, one file per feature: `wallet.ts`, `market.ts`, `spot.ts`, `admin.ts`, etc.
- `socket.ts` for WebSocket state

## Helpers (`interface/src/lib/helpers/`)

- API calls and utility functions organized by domain:
  - `mrm/` — backend API calls
  - `mixin/` — Mixin blockchain helpers
  - `currency/` — currency formatting
  - `candle/`, `chart.ts` — chart-related
  - `utils.ts`, `helpers.ts` — general utilities
  - `constants.ts` — shared constants

## Types (`interface/src/lib/types/`)

- TypeScript interfaces organized by domain: `common/`, `hufi/`, `coingecko/`

## i18n (`interface/src/i18n/`)

- Language JSON files (`en.json`, `zh.json`, etc.)
- Always use `$_()` for user-visible text, add keys to `en.json` first

## Styling

- Use daisyui + tailwind classes only — no custom CSS unless absolutely necessary
- Follow the color conventions in Tech Stack above
- Theme system: `main-light`, `main-dark`, `admin-light`, `admin-dark`

# Conventions

## Dependencies
Use bun (not npm/yarn/pnpm)

## Package Dependencies
- Keep dependencies minimal in package.json — only add when truly necessary
- Prefer well-established, widely-used libraries over niche or unmaintained ones
- Before adding a new dependency, evaluate if the functionality can be achieved with existing packages or minimal custom code

## Commits
No agent signatures (Claude, sisyphus, etc.) in commit messages

## Docs
- Keep docs updated with code changes
- Update docs/planning/progress-log.md (one line per change)
- Keep docs/architecture/server/ as the md mirror of active server architecture
- If you need to read documentation, look in `docs/` first

# Security
Never read .env files directly
