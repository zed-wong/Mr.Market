# Principles
Follow KISS, YAGNI, and DRY. Don't add unnecessary code. Reuse existing codebase.

# Tech Stack
- **Frontend**: Always use Svelte 4 syntax + SvelteKit + daisyui/tailwind + svelte-i18n (`$_()`)
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
- Keep docs updated: `docs/planning/progress-log.md`, `docs/architecture/server/`.
- Never read `.env` files.
