# Principles
Follow KISS, YAGNI, and DRY. Don't add unnecessary code. Reuse existing codebase.

# Architecture

Source of truth: `docs/` yellowpaper.

## Three Layers
1. **Funding Layer** — deposits, withdrawals, rewards
2. **Scheduling Layer** — tick, strategy controllers, intent dispatch
3. **Trading Layer** — reservation, exchange orders, fills, reconciliation

## Invariants
- **Ledger is the balance source of truth.** No in-memory-only balances.
- **Market-making balance is scoped by `orderId + asset`**, not `userId + asset`.
- **All balance changes** → immutable ledger entries, idempotent, transactional.
- **External orders** → risk check → order-level reservation before proceeding.
- **Strategy controllers** produce actions/intents only. They must **never** place exchange orders or mutate balances.
- **Intent workers** own reservation, exchange mutation, tracked orders, and state transitions.
- **Tick must not block** on exchange I/O, REST calls, or DB settlement.
- **Fills, fees, withdrawals, rewards, reversals** → attributable to a specific order.
- **Reconciliation** blocks risk-increasing operations on mismatch.
- **No generic balance adjustment paths.** Only typed, order-attributed mutations.

# Tech Stack
- **Frontend**: For interface (use Svelte 4), for other interface (use Svelte 5) + SvelteKit + daisyui/tailwind + svelte-i18n (`$_()`)
- **Backend**: Always use bignumber.js for calculation, and getRFC3339Timestamp() for timestamp

# Styling Rules
- daisyui semantic colors only: `text-base-100` / `bg-base-100` / `text-base-content` / `bg-base-content` / `bg-base-300`
- No custom colors (e.g. `text-gray-900`). Use `capitalize`, not `uppercase`. Use `<span>` + tailwind, not `<h1>`/`<p>`.

# Frontend File Placement (`interface/src/`)

```
routes/                          # Pages — SvelteKit file-based routing
  (bottomNav)/                   # Main app (home, market, spot, swap, wallet, market-making, admin)
  (secondary)/                   # Screens without bottom nav
  */+page.svelte                 # Each page
  */components/                  # Page-specific components (only used by that page)

lib/
  components/                    # Shared components (reused across pages)
    common/                      # Generic UI (loading, icons, etc.)
    {feature}/                   # Feature folders: admin, home, market, spot, wallet...
    dialogs/ topBar/ bottomNav/ skeleton/
  stores/                        # Svelte stores, one file per feature
  helpers/                       # API calls & utils by domain (mrm/, mixin/, currency/)
  types/                         # TypeScript interfaces by domain (common/, hufi/)
i18n/                            # Language JSONs, en.json is default
```

**Rule**: Component used by one page → page's `components/`. Reused across pages → `lib/components/`.

# Conventions
- Use **bun** (not npm/yarn/pnpm). Keep dependencies minimal.
- No agent signatures in commit messages.
- Keep docs updated: `docs/plans/progress.md`, `docs/architecture/server/`, `docs/architecture/strategies/`.
- Never read `.env` files. Ask for permission before adding .env fields.
- Always keep the architecture 100% perfect at present, don't do compatibility unless mentioned
