# Merge landing-interface + web3-interface (Uniswap-style)

Date: 2026-05-29

## Goal
Merge `landing-interface` into `web3-interface` as a single SvelteKit app. The marketing
landing lives at `/`; the web3 app lives under `/app/*`. "Open App" is a single click from
landing to `/app` (Uniswap-style: marketing first, app one click away).

Decisions:
- URL structure: **full `/app/*` prefix** for every app page (clean separation).
- Host: **merge into `web3-interface`**, keep `landing-interface/` untouched for now.
- Versions: bump the merged `package.json` to **exact latest** for all deps.

## Current state
Both are independent SvelteKit SPA apps (`adapter-static`, `index.html` fallback) on the same
core stack: Svelte 5, Tailwind 4, daisyui 5.

| | landing-interface | web3-interface |
|---|---|---|
| Routes | `/`, `/offerings` (+`[slug]`), `/architecture`, `/leaderboard` | `/` (dashboard), `/wallet`, `/market`, `/market-making`, `/deposit`, `/withdraw`, `/account`, `/login` |
| Layout | minimal (`<slot/>` + css) | SideNav + TopBar + wallet auth (Reown) on every page |
| Theme | single `landing-light`, forced | `web3-light` / `web3-dark` toggle |
| Fonts | Geist + Geist Mono + Inter | Inter only |
| i18n / wallet | none | svelte-i18n + Reown AppKit + SIWE |
| "Open App" | external `https://mr-market-app.onrender.com` | — |

Both define a root `/` page and a root `+layout.svelte`, so they collide — one home must move.

## 1. Route restructure (`web3-interface/src/routes/`)
Use a `(marketing)` route group for the landing site and a real `app/` directory for the app
(so URLs gain the `/app` prefix).

```
routes/
  +layout.svelte            # NEW minimal global shell: imports app.css once, renders children (no chrome)
  (marketing)/
    +layout.svelte          # NEW: forces data-theme="landing-light"; renders <slot/>
    +layout.ts              # NEW: prerender = true (static landing)
    +page.svelte            # landing home (from landing-interface)
    offerings/  (+ [slug])  # copied
    architecture/           # copied
    leaderboard/            # copied
  app/
    +layout.svelte          # MOVED from current routes/+layout.svelte (SideNav/TopBar/wallet/auth + web3 theme + i18n init)
    +layout.ts              # MOVED current routes/+layout.ts (ssr=false, prerender=false, trailingSlash)
    +page.svelte            # MOVED current routes/+page.svelte (dashboard -> /app)
    account/ deposit/ login/ market/ market-making/ wallet/ withdraw/   # all MOVED under app/
```

- i18n init currently runs in the web3 root layout -> moves with it into `app/+layout.svelte`
  (marketing pages do not use `$_()`).
- Global `routes/+layout.svelte` becomes minimal: import `app.css`, render children, impose no chrome.
- Remove the existing `../app.css` import from the moved `app/+layout.svelte`; CSS is imported only by
  the root `routes/+layout.svelte`, because the old relative import path breaks after moving under `app/`.

## 2. Rewrite app-internal links to `/app/*`
Update every internal navigation in the moved app code:
- `lib/components/sideNav/SideNav.svelte` — navItems (`/`->`/app`, `/market`->`/app/market`,
  `/market-making`, `/wallet`, `/account`), both logo links, and `isActive`/`navTestId` home special-case.
- `lib/components/dialogs/SessionExpiredDialog.svelte` — `/login`->`/app/login`.
- `app/+layout.svelte` — `goto('/login')`->`/app/login`.
- `app/+page.svelte` — quickActions + CTAs (`/wallet`, `/market-making`, `/market`, `/deposit`).
- `app/market-making/**` — gotos + hrefs (`/market-making`, `/market-making/order/new`, `/deposit`, `/wallet`).
- `app/market/**` — `/market`, `/market-making`.
- `app/wallet/+page.svelte` — `/deposit`, `/withdraw`.
- `app/login/+page.svelte` — `goto('/')`->`/app`, `goto('/market-making')`->`/app/market-making`, `href="/"`->`/app`.
- Tests `lib/stores/market-making-*-route.test.ts` — update asserted goto paths to `/app/...`.

Landing/marketing links (`/offerings`, `/leaderboard`, `/architecture`) stay at root — no change.

## 3. Landing -> App entry point
- `lib/landing/LandingNav.svelte`: change "Open App" from the external Render URL to `href="/app"`.

## 4. Styling / theme merge
- `daisyui-themes.css`: register all three themes in one file —
  `web3-light --default, web3-dark --prefersdark, landing-light` — keeping each variable block.
- `app.css`: single merged file — `@import "tailwindcss"`, merged font imports (Inter + Geist + Geist Mono),
  the merged themes import, web3 `@layer base`/`@utility` blocks, and landing's custom classes
  (`.balance-font`, `.data-font`, `.liquidity-object`, `.quiet-rule`, `.micro-label`, `.premium-surface`,
  animations, etc.).
- Theme applied per-group via `data-theme` (landing-light vs web3 light/dark toggle); `app.html`
  default stays `web3-light`.
- `app.html`: remove the global `robots noindex,nofollow` so the marketing landing is indexable
  (landing already sets its own SEO `<svelte:head>`).
- Add app-scoped `<svelte:head><meta name="robots" content="noindex,nofollow" /></svelte:head>` in
  `app/+layout.svelte` if the app dashboard should remain non-indexable while the landing page is indexable.
- Copy `lib/landing/` (LandingNav + data.ts) into `web3-interface/src/lib/`. Static logo is identical
  in both — no asset copy needed.

## 5. Dependencies — bump merged `package.json` to exact latest
Union of both apps' deps, pinned exactly to latest verified on 2026-05-29. Use exact versions
instead of caret ranges so the merge is reproducible.

### devDependencies
| Package | Target |
|---|---|
| @sveltejs/adapter-static | 3.0.10 |
| @sveltejs/kit | 2.61.1 |
| @sveltejs/vite-plugin-svelte | 7.1.2 |
| @tailwindcss/vite | 4.3.0 |
| @types/node | 25.9.1 |
| daisyui | 5.5.20 |
| svelte | 5.55.10 |
| svelte-check | 4.4.8 |
| tslib | 2.8.1 |
| typescript | 6.0.3 |
| vite | 8.0.14 |
| vitest | 4.1.7 |

### dependencies
| Package | Target |
|---|---|
| @fontsource/geist | 5.2.9 |
| @fontsource/geist-mono | 5.2.8 |
| @fontsource/inter | 5.2.8 |
| @reown/appkit | 1.8.20 |
| @reown/appkit-adapter-solana | 1.8.20 |
| @reown/appkit-adapter-wagmi | 1.8.20 |
| @solana/wallet-adapter-wallets | 0.19.38 |
| @wagmi/connectors | 8.0.15 |
| @wagmi/core | 3.5.0 |
| bignumber.js | 11.1.1 |
| clsx | 2.1.1 |
| svelte-i18n | 4.0.1 |
| svelte-sonner | 1.1.1 |
| tailwindcss | 4.3.0 |
| viem | 2.51.3 |

`@fontsource/geist` + `@fontsource/geist-mono` are new (from landing). All reown packages are
aligned to 1.8.20.

### Major-version bumps — verify for breaking changes
- `@reown/appkit*` 1.3 -> 1.8 (wallet/SIWE init in `app/+layout.svelte` + `helpers/wallet/appkit`)
- `@wagmi/connectors` 5 -> 8, `@wagmi/core` 2 -> 3 (wagmi adapter wiring)
- `viem` 2.28 -> 2.51 (minor, but moves with wagmi 3)
- `bignumber.js` 9 -> 11 (backend rule uses it; check frontend usages)
- `typescript` 5 -> 6, `@types/node` 20 -> 25 (type/compiler fallout)

Upgrade to latest first. If breaking changes occur, update the app code for the latest package versions
rather than downgrading, unless downgrade approval is explicitly given.

## 6. Config
- `vite.config.ts`: keep `host: 0.0.0.0`; optionally add landing's `allowedHosts: ['.lhr.life']`.

## 7. Verify
- `bun install`
- `bun run check` (svelte-check) and `bun run test:unit` (vitest) — fix type/link-assertion fallout.
- `bun run build` — confirm the static build succeeds.
- Final stale-link search: confirm there are no app links left at root paths such as `href="/wallet"`,
  `href="/market-making"`, `href="/deposit"`, `href="/withdraw"`, `href="/login"`, or corresponding
  `goto('/...')` calls outside marketing links.
- Manual smoke:
  - `/` landing renders with landing theme, no SideNav; "Open App" -> `/app`.
  - `/app` dashboard renders with SideNav/TopBar/wallet; app nav + deep links
    (`/app/wallet`, `/app/market-making/order/new`) work.
  - Marketing routes (`/offerings`, `/leaderboard`, `/architecture`) work.

Leaves `landing-interface/` in place (untouched) per choice.
