# Plan: Extract an Independent `admin-interface` (Svelte 5 + Latest SvelteKit + Latest daisyUI/Tailwind)

**Date:** 2026-05-11
**Status:** Working
**Prerequisite Plan:** [2026-05-10-multichain-interface-restructure.md](./2026-05-10-multichain-interface-restructure.md)

---

## 1. Background and Goals

Following step 2 of the split sequence in the [2026-05-10 multichain restructure plan](./2026-05-10-multichain-interface-restructure.md), extract `interface/src/routes/(bottomNav)/(admin)/manage/**` into an independent SPA app named `admin-interface/`, deployed separately to `admin.mrmarket.one`.

This plan only covers the admin split. It does **not** include:
- Splitting `mixin-interface` / `web3-interface` / `web/`
- Implementing bun workspaces. Admin starts as an independent subdirectory inside the repo; workspace conversion is a parallel task.
- Server changes unrelated to admin authentication. After extraction, admin continues to call the existing `/v1/admin/*` business APIs, but the admin login/session model must be upgraded at the same time.

### Core Constraints (Must Satisfy)

- The new app is **fully independent** and does not share `node_modules`, build pipelines, or routes with `interface/`.
- Tech stack: **Svelte 5** (runes syntax), **latest SvelteKit** compatible with Svelte 5, **latest Tailwind v4 + daisyUI v5**, and **bun**.
- Existing `interface/src/routes/(bottomNav)/(admin)/**` must **remain functional** until the new admin is fully validated and traffic is cut over. The first **four phases** of this plan must not delete any existing admin routes or helpers.
- Backend admin business APIs remain unchanged. `/auth/login` continues to use **Bearer JWT**, but the new admin standardizes the flow: password login returns a 7-day JWT, the frontend stores it in `localStorage`, all admin requests send `Authorization: Bearer`, and the server adds brute-force defense, audit logging, revocation support, and passkey login. The new admin does **not** use cookies for JWT auth and does **not** require CSRF.
- Follow `AGENTS.md`: daisyUI semantic colors (`bg-base-100` / `text-base-content` / `bg-base-300`, etc.), `svelte-i18n` `$_()`, never read `.env`, no agent signatures in commit messages, and use `bun` instead of npm/yarn/pnpm.
- Current admin uses Svelte 4. The new admin uses **Svelte 5 runes syntax (`$state` / `$derived` / `$effect` / `$props` / `$bindable`)**. This is the only allowed exception to the `AGENTS.md` "Svelte 4 syntax" rule because the new admin is 100% independent.

---

## 2. Current State Inventory

### 2.1 Admin Routes

Routes to migrate, rooted at `interface/src/routes/(bottomNav)/(admin)/`:

| Route | Files |
|---|---|
| Login entry, also the `/manage` dashboard container | `+layout.ts`, `+layout@.svelte`, `manage/+page.svelte` |
| User management | `manage/users/+page.svelte` |
| Exchange management | `manage/exchanges/+page.svelte` |
| Health checks | `manage/health/+page.svelte` |
| In-app messages | `manage/message/+page.svelte` |
| Order management | `manage/orders/+page.svelte`, `manage/orders/spot/+page.svelte`, `manage/orders/swap/+page.svelte` |
| Revenue | `manage/revenue/+page.svelte` |
| Direct market making | `manage/market-making/direct/+page.svelte`, `+page.ts` |
| Rebalance | `manage/rebalance/+page.svelte`, `manage/rebalance/new/+page.svelte` |
| Settings home | `manage/settings/+page.svelte`, `+page.ts` |
| API keys | `manage/settings/api-keys/+page.svelte`, `+page.ts` |
| Exchange configuration | `manage/settings/exchanges/+page.svelte`, `+page.ts` |
| Fee configuration | `manage/settings/fees/+page.svelte`, `+page.ts` |
| Spot trading settings | `manage/settings/spot-trading/+page.svelte`, `+page.ts` |
| Market-making settings | `manage/settings/market-making/+page.svelte`, `+page.ts` |
| Strategy settings | `manage/settings/strategies/+page.svelte`, `+page.ts` |

### 2.2 Shared Admin Code

| Category | Path |
|---|---|
| Components | `interface/src/lib/components/admin/` including `dashboard/`, `exchanges/`, `health/`, `message/`, `orders/`, `rebalance/`, `settings/`, `users/`, `login.svelte`, `dashboard.svelte` |
| Helpers | `interface/src/lib/helpers/mrm/admin.ts`, `interface/src/lib/helpers/mrm/admin/{direct-market-making,exchanges,fee,growdata,minBalances,spotdata,strategy}.ts` |
| Shared helpers partially used by admin | `interface/src/lib/helpers/mrm/{base,common,strategy}.ts`, `interface/src/lib/helpers/constants.ts`, `interface/src/lib/helpers/utils.ts`, `interface/src/lib/helpers/encryption/*` |
| Stores | `interface/src/lib/stores/admin.ts`, `interface/src/lib/stores/theme.ts` |
| Types | `interface/src/lib/types/hufi/{admin,admin-direct-market-making,exchanges,strategy-definition}.ts` and other hufi types referenced by admin |
| Theme | `toAdminTheme()` from `interface/src/lib/theme/themes.ts`, and admin themes from `daisyui-themes.css` |
| i18n | Admin / token_expired / login / manage / settings keys from `interface/src/i18n/en.json` and `zh.json` |
| Auth flow | `localStorage` keys `admin-access-token` / `admin-password`, `POST /auth/login`, `autoCheckPassword()`, `exit()` |

### 2.3 Behavioral Dependencies

- Route group `(admin)/+layout@.svelte` uses `@` to reset layout and escape `(bottomNav)`.
- `ssr = false`; current admin is an SPA.
- Auth failure redirects to `/manage`, which also acts as the login page.
- `showTokenExpired` store triggers the global token-expired modal.
- Theme is derived from `darkTheme` store + `toAdminTheme()` mapping.

---

## 3. Target Structure

```text
mrmarket/
├── interface/              # Existing mixin app; admin routes remain temporarily
└── admin-interface/        # New deliverable for this plan
    ├── package.json        # bun, independent dependencies
    ├── bun.lockb
    ├── svelte.config.js    # SvelteKit + adapter-static
    ├── vite.config.ts
    ├── tailwind.config.js  # Or v4 CSS-only config
    ├── postcss.config.js
    ├── tsconfig.json
    ├── .gitignore
    ├── README.md
    ├── src/
    │   ├── app.html
    │   ├── app.css         # Tailwind v4 + daisyUI theme
    │   ├── app.d.ts
    │   ├── hooks.client.ts # 401/token expired → showSessionExpired
    │   ├── routes/
    │   │   ├── +layout.svelte           # Global shell: sidebar + login gate + session-expired modal
    │   │   ├── +layout.ts               # ssr = false, prerender = false
    │   │   ├── +page.svelte             # Old manage/+page.svelte dashboard
    │   │   ├── login/+page.svelte       # Dedicated login page replacing old inline login
    │   │   ├── users/+page.svelte
    │   │   ├── exchanges/+page.svelte
    │   │   ├── health/+page.svelte
    │   │   ├── message/+page.svelte
    │   │   ├── orders/+page.svelte
    │   │   ├── orders/spot/+page.svelte
    │   │   ├── orders/swap/+page.svelte
    │   │   ├── revenue/+page.svelte
    │   │   ├── market-making/direct/+page.svelte (+ +page.ts)
    │   │   ├── rebalance/+page.svelte
    │   │   ├── rebalance/new/+page.svelte
    │   │   └── settings/
    │   │       ├── +page.svelte (+ +page.ts)
    │   │       ├── api-keys/+page.svelte (+ +page.ts)
    │   │       ├── exchanges/+page.svelte (+ +page.ts)
    │   │       ├── fees/+page.svelte (+ +page.ts)
    │   │       ├── spot-trading/+page.svelte (+ +page.ts)
    │   │       ├── market-making/+page.svelte (+ +page.ts)
    │   │       └── strategies/+page.svelte (+ +page.ts)
    │   ├── lib/
    │   │   ├── components/
    │   │   │   ├── shell/        # Sidebar, TopBar, SessionExpiredDialog, LoginCard
    │   │   │   ├── dashboard/
    │   │   │   ├── exchanges/
    │   │   │   ├── health/
    │   │   │   ├── message/
    │   │   │   ├── orders/
    │   │   │   ├── rebalance/
    │   │   │   ├── settings/
    │   │   │   ├── users/
    │   │   │   └── common/       # Loading, icons, table primitives
    │   │   ├── stores/
    │   │   │   ├── auth.ts       # correct / submitted / showSessionExpired, writable stores compatible with runes
    │   │   │   ├── theme.ts
    │   │   │   └── userSearch.ts
    │   │   ├── helpers/
    │   │   │   ├── api/
    │   │   │   │   ├── client.ts         # fetch wrapper, attaches localStorage Bearer token, raises 401
    │   │   │   │   ├── auth.ts           # password/passkey login, token/session check, logout
    │   │   │   │   ├── exchanges.ts
    │   │   │   │   ├── fees.ts
    │   │   │   │   ├── strategies.ts
    │   │   │   │   ├── direct-market-making.ts
    │   │   │   │   ├── growdata.ts
    │   │   │   │   ├── spotdata.ts
    │   │   │   │   ├── minBalances.ts
    │   │   │   │   └── ...
    │   │   │   ├── encryption/   # Copy original RSA/Sodium helpers
    │   │   │   ├── format.ts
    │   │   │   └── constants.ts          # MRM_BACKEND_URL, etc.
    │   │   ├── types/             # Only the hufi type subset used by admin
    │   │   └── theme/
    │   │       ├── themes.ts             # toAdminTheme()
    │   │       └── daisyui-themes.css
    │   └── i18n/
    │       ├── en.json           # Only admin-related key subset
    │       ├── zh.json
    │       └── i18n.ts
    ├── static/
    └── tests/
        ├── unit/                 # vitest
        └── e2e/                  # playwright, covering login + page smoke tests
```

`adapter-static` outputs an SPA with `fallback: 'index.html'`, matching current admin behavior (`ssr=false`).

---

## 4. Key Decisions

### 4.1 Route Prefix

The old route prefix is `/manage/*`. The new app is deployed on the independent domain `admin.mrmarket.one`, so the `/manage` prefix is removed: root `/` is the dashboard, and routes become `/users`, `/settings/...`, etc.

| Old path | New path |
|---|---|
| `/manage` | `/` |
| `/manage/users` | `/users` |
| `/manage/settings/api-keys` | `/settings/api-keys` |
| `/manage/orders/spot` | `/orders/spot` |

Old `/manage/*` remains in `interface/` during the compatibility period, so existing links keep working.

### 4.2 Authentication

The new admin keeps JWT as an explicit Bearer token stored in `localStorage`. Because auth uses the `Authorization` header instead of browser-attached cookies, CSRF protection is not part of this plan.

- `POST {MRM_BACKEND_URL}/auth/login`: request body `{ password }`. The password is submitted to the backend over HTTPS. The frontend **does not** pre-hash it with SHA-256 and does not save `admin-password`.
- After validating the password, the backend signs a 7-day JWT and returns it in the response body, for example `{ access_token, expires_in: 604800 }`.
- The frontend stores the JWT in `localStorage['admin-access-token']`. It must not store the password or write the JWT to cookies, URLs, logs, analytics, or unrelated storage.
- Page refresh/browser restart keeps the admin logged in until the JWT expires, is revoked, or logout clears it.
- The JWT payload must include an admin token version. The backend stores the current global admin token version and rejects tokens whose version no longer matches. Logout, lockout, and emergency revocation increment the global admin token version, invalidating existing admin tokens without rotating the shared `JWT_SECRET`.
- `POST /auth/logout`: called with `Authorization: Bearer <token>` and invalidates existing admin tokens by incrementing the global admin token version. The frontend then clears `localStorage['admin-access-token']`.
- `GET /auth/session`: called with `Authorization: Bearer <token>` to confirm whether the current stored token is still valid. It returns minimal admin state; the permission model remains single-admin for now.
- CSRF: not required because the browser does not automatically attach `Authorization: Bearer` headers cross-site.
- `lib/helpers/api/client.ts` standardizes on native `fetch`:
  - Adds `Authorization: Bearer ${token}` when a valid localStorage token exists.
  - Never logs or exposes the JWT outside the auth helper/client boundary.
  - 401 → `showSessionExpired.set(true)`, show modal, then `goto('/login')` after confirmation.
- Login protection: `/auth/login` must have rate limiting, failed-login lockout, and success/failure audit logs.
- Admin write operations must write audit logs containing at least action, path, method, session id, request id, timestamp, and result. Do not log passwords, API secrets, or other sensitive data.
- Passkey must be implemented in this plan for both frontend and server. Passkey registration requires an existing password-authenticated admin session. Passkey login is a passwordless alternative to password login. The server should expose endpoints under `/auth/passkeys/*`, and successful passkey login returns the same 7-day Bearer JWT shape as password login.

### 4.3 API Configuration

- `MRM_BACKEND_URL` is read from `import.meta.env.PUBLIC_MRM_BACKEND_URL` using standard Vite behavior. Do **not** read `.env` contents; deployment injects the value at build time.
- Fail fast when missing: do not default to production API or same-origin, to avoid accidental dev/staging connections to production.
- Cross-origin requirements: `api.mrmarket.one` must allow `https://admin.mrmarket.one` and the `Authorization` header. Cookie credentials are not required for admin JWT auth.

### 4.4 i18n

- Use `svelte-i18n`; keep `$_()` usage unchanged.
- Migrate only the keys used by admin. Use grep over existing admin components to collect `$_('...')` keys.
- `en.json` is the default; keep `zh.json` synchronized. After extraction, maintain admin translations only under `admin-interface/src/i18n/`.
- Extract shared keys from `interface/src/i18n/{en,zh}.json` but **do not delete source keys** during compatibility because the mixin app still uses them.

### 4.5 Theme

- Copy `toAdminTheme(darkTheme)` from `themes.ts` and admin-related themes from `daisyui-themes.css`.
- `darkTheme` store: use an admin-specific persistence key to avoid interference with the mixin theme, for example `localStorage['admin-dark-theme']`.
- All UI must use semantic colors: `bg-base-100/200/300`, `text-base-content`, `text-primary`, etc. **Do not use** `text-gray-*`, `bg-white`, or `uppercase`; use `capitalize` instead.

### 4.6 Svelte 5 Adaptation Points

Existing components use many Svelte 4 patterns. Convert them consistently during migration:

| Svelte 4 | Svelte 5 |
|---|---|
| `export let foo` | `let { foo } = $props()` |
| `let count = 0` for reactive state | `let count = $state(0)` |
| `$: doubled = count * 2` | `let doubled = $derived(count * 2)` |
| `$: { sideEffect(value); }` | `$effect(() => { sideEffect(value); })` |
| `bind:value={x}` with child `export let x` | `let { x = $bindable() } = $props()` |
| `<slot />` | `{@render children?.()}` + `let { children } = $props()` |
| `on:click={fn}` | `onclick={fn}` |

Stores may still use `writable` from `svelte/store` and `$store` auto-subscriptions; they are compatible with runes.

### 4.7 Minimal Dependencies

Install only: `@sveltejs/kit`, `@sveltejs/adapter-static`, `svelte` 5, `vite`, `typescript`, `svelte-check`, `tailwindcss` v4, `@tailwindcss/vite`, `daisyui` v5, `svelte-i18n`, `bignumber.js`, `clsx`, `axios` only if still needed by copied helpers, and encryption dependencies such as `jsencrypt` and `crypto-js` as needed.

Do **not** install: `klinecharts`, `lightweight-charts`, `socket.io-client`, `@mixin.dev/mixin-node-sdk`, `tweetnacl*`, `libsodium-wrappers`, or `svelte-carousel`; these are unrelated to admin.

---

## 5. Phased Plan

### Phase 0 — Preparation (0.5d)

- [ ] Register this plan in `docs/plans/progress.md`.
- [ ] Create the `admin-interface/` skeleton at the repo root, with an empty README and `.gitignore`.
- [ ] Do not modify `interface/`.

**Non-code outputs only:** directory creation and this document/progress update.

### Phase 1 — Scaffold (1d)

- [ ] `bun create` a latest SvelteKit project, confirm the Svelte 5 template, and place it under `admin-interface/`.
- [ ] Upgrade to the selected versions:
  - [ ] Verify `svelte@^5` and `@sveltejs/kit@latest` compatible with Svelte 5.
  - [ ] `tailwindcss@^4`, `@tailwindcss/vite`, `daisyui@^5`.
  - [ ] `svelte-i18n@^4`.
- [ ] Configure `adapter-static` with `fallback: 'index.html'` and `precompress: false`.
- [ ] Import Tailwind v4 + daisyUI in global `app.css`, and enable the existing admin theme.
- [ ] Add `<html data-theme="...">` in `app.html` or set `data-theme={adminTheme}` in `+layout.svelte`.
- [ ] `+layout.ts`: `export const ssr = false; export const prerender = false; export const trailingSlash = 'never';`.
- [ ] Configure `svelte-i18n`: register en/zh in `src/i18n/i18n.ts`, and copy empty JSON skeletons.
- [ ] Add scripts: `bun run dev`, `bun run build`, `bun run check`, `bun run lint`, `bun run test:unit`, `bun run test:e2e`.
- [ ] Commit hello-world: root route displays "Admin".

**Validation:**

```bash
cd admin-interface
bun install
bun run check
bun run build
bun run preview
```

### Phase 2 — Shell + Authentication (2–3d)

- [ ] `lib/helpers/constants.ts`: read `PUBLIC_MRM_BACKEND_URL`.
- [ ] Server: keep `POST /auth/login` returning a 7-day JWT response, for example `{ access_token, expires_in: 604800 }`, and include the current global admin token version in the JWT.
- [ ] Server: add `GET /auth/session` and `POST /auth/logout` for Bearer-token session check and revocation.
- [ ] Server: keep admin guard on Bearer JWT, but add global admin token version validation.
- [ ] Server: add login rate limiting, failed-login lockout, and audit logs for login/logout/admin write operations.
- [ ] Server: add admin passkey registration/authentication endpoints under `/auth/passkeys/*`; registration requires a password-authenticated admin session, and successful passkey login returns the same Bearer JWT response as password login.
- [ ] `lib/helpers/api/client.ts`: fetch wrapper that attaches the `localStorage['admin-access-token']` Bearer token and handles 401 → `showSessionExpired.set(true)`.
- [ ] `lib/helpers/api/auth.ts`: implement password login, passkey login/registration helpers, `checkSession`, localStorage token handling, and `logout`.
- [ ] `lib/stores/auth.ts`: `submitted`, `checked`, `correct`, `loginLoading`, `showSessionExpired`.
- [ ] `lib/stores/theme.ts`: `darkTheme`, persisted under `admin-dark-theme`.
- [ ] `lib/theme/themes.ts` + `daisyui-themes.css`: copy and trim.
- [ ] `lib/components/shell/Sidebar.svelte`, `TopBar.svelte`, `SessionExpiredDialog.svelte`, `LoginCard.svelte`, rewritten with Svelte 5 runes.
- [ ] `routes/+layout.svelte`: sidebar gate where `checkSession()` failure redirects to `/login`; session-expired modal.
- [ ] `routes/login/+page.svelte`: login card.
- [ ] `routes/+page.svelte`: placeholder dashboard.

**Validation:**

```bash
cd admin-interface
bun run check
bun run build
# Manual: run dev, open /, confirm unauthenticated users go to /login; correct password returns to /.
# Manual: refresh the page and confirm the localStorage token keeps the admin logged in until expiry/revocation.
# Manual: revoke/logout token and confirm old Bearer token cannot access admin APIs.
```

### Phase 3 — Page Migration (4–6d)

Migrate pages in this order. After each page, run `bun run check` and manual smoke testing.

- [ ] **Dashboard `/`**: `manage/+page.svelte` + `dashboard/*.svelte`.
- [ ] **Settings `/settings`** including `api-keys`, `exchanges`, `fees`, `spot-trading`, `market-making`, and `strategies` subpages.
- [ ] **Exchanges `/exchanges`**.
- [ ] **Users `/users`**, including the `userSearch` store.
- [ ] **Health `/health`**.
- [ ] **Message `/message`**.
- [ ] **Orders `/orders`**, `/orders/spot`, `/orders/swap`.
- [ ] **Revenue `/revenue`**.
- [ ] **Market-making Direct `/market-making/direct`**.
- [ ] **Rebalance `/rebalance`**, `/rebalance/new`.

Per-page migration rules:
1. Copy `.svelte` files and convert to Svelte 5 runes syntax.
2. Copy dependent components to `admin-interface/src/lib/components/{feature}/`.
3. Copy dependent helpers to `admin-interface/src/lib/helpers/api/{feature}.ts`, and use the `client.ts` wrapper for fetch calls.
4. Copy dependent types to `admin-interface/src/lib/types/`.
5. Extract i18n keys into `src/i18n/{en,zh}.json`.
6. Validate: `bun run check` passes, page renders in dev, API requests return 200, and tables/forms are interactive.

**Forbidden:** do not delete any files under `interface/`.

### Phase 4 — Tests (2d)

- [ ] Unit tests: migrate and adjust admin-related tests such as `marketMakingBalance.test.ts`, `direct-market-making.test.ts`, and `strategy.test.ts` into `admin-interface/tests/unit/`.
- [ ] E2E with Playwright:
  - [ ] Login flow.
  - [ ] Token expiration/revocation → modal → re-login.
  - [ ] Every nav entry opens and returns 200.
  - [ ] Key settings forms submit successfully using a mocked backend or staging backend.
- [ ] `bun run lint`, `bun run check`, `bun run test:unit`, and `bun run test:e2e` all pass.

**Validation:**

```bash
cd admin-interface
bun run lint
bun run check
bun run build
bun run test:unit
bun run test:e2e
```

### Phase 5 — Deployment + Gradual Rollout (1d)

- [ ] Add an `admin-interface/` CI build job running in parallel with `interface/`.
- [ ] Deploy to `admin.mrmarket.one`.
- [ ] Backend CORS allows this domain and the `Authorization` header; JWT expiration/revocation, lockout, audit, and passkey flows are validated in staging.

### Phase 6 — Cutover (0.5d, Final Phase of This Plan)

Only after all [Cutover Criteria](#7-cutover-criteria) are met:

- [ ] Delete the entire `interface/src/routes/(bottomNav)/(admin)/` directory.
- [ ] Delete `interface/src/lib/components/admin/`.
- [ ] Delete `interface/src/lib/helpers/mrm/admin.ts` and `interface/src/lib/helpers/mrm/admin/`.
- [ ] Delete `interface/src/lib/stores/admin.ts`.
- [ ] Delete `interface/src/lib/types/hufi/admin*.ts` and any admin-only parts of `strategy-definition.ts`.
- [ ] Clean admin-only keys from `interface/src/i18n/{en,zh}.json`.
- [ ] Delete `toAdminTheme` from `interface/src/lib/theme/themes.ts` if it is only used by admin.
- [ ] `cd interface && bun run check && bun run lint && bun run build` all pass.
- [ ] Update `docs/plans/progress.md` to mark completion.
- [ ] Update the root `AGENTS.md` "Frontend File Placement" section to remove the `(admin)` route group.
- [ ] Update `docs/architecture/server/` if it contains old `/manage/*` links.

---

## 6. Validation Commands Summary

Every PR must pass locally:

```bash
# New admin
cd admin-interface
bun install
bun run lint
bun run check
bun run build
bun run test:unit
bun run test:e2e

# Old interface must not be broken
cd ../interface
bun install
bun run check
bun run build
bun run test:unit
```

Manual smoke checklist for staging:

```text
[ ] Open https://admin.mrmarket.one → redirects to /login
[ ] Enter correct password → redirects to /
[ ] Click through all 11 sidebar entries, with no console errors
[ ] Refresh any authenticated page → localStorage token keeps the admin authenticated
[ ] Expire/revoke token, call any admin API → 401 → modal → re-login
[ ] Confirm in DevTools that JWT exists only in `localStorage['admin-access-token']`, not cookies/sessionStorage/URLs
[ ] Confirm logout invalidates the old Bearer token immediately
[ ] Complete passkey registration and passkey login smoke test
[ ] Toggle dark/light theme → theme is correct
[ ] zh / en switching works
[ ] Change one fee configuration → save → refresh and confirm it persists
[ ] Submit one strategy configuration → backend returns 200
[ ] /orders/spot list loads, pagination/filtering works
[ ] /revenue data is correct
```

---

## 7. Cutover Criteria

**All criteria must be met before Phase 6 deletes old admin:**

1. ✅ `admin-interface/` runs stably on production domain `admin.mrmarket.one` for at least 7 days with no P0/P1 defects.
2. ✅ All 11 nav entries and all subpages have been visited by real admins in production with no errors.
3. ✅ Auth flows for login, session expiration, and logout are verified in production.
4. ✅ New admin Bearer JWT auth is live: token stored in `localStorage['admin-access-token']`, no password storage, and lockout, audit, logout/revocation are verified.
5. ✅ Admin passkey registration and passkey login are implemented and verified on frontend and server.
6. ✅ Every write operation has been executed at least once and verified: fees, strategies, API keys, market-making settings, and rebalance.
7. ✅ `bun run check`, `lint`, `test:unit`, and `test:e2e` all pass.
8. ✅ Backend CORS allows `admin.mrmarket.one` and the `Authorization` header, with no cross-origin errors.
9. ✅ Internal announcement is complete, and all admins know the new URL.

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Svelte 5 runes differ from the Svelte 4 component mental model and may introduce bugs | Smoke test each page after migration; cover key flows with e2e; avoid unrelated functional changes during migration. |
| Tailwind v4 config differs from `interface/`, which also uses v4 | Reuse the v4 approach from `interface/postcss.config.js`. |
| daisyUI v5 class behavior changes | Review daisyUI v5 changelog before migration, especially heavily used admin components such as `modal-bottom`, `btn-ghost`, and `menu`. |
| Bearer JWT cross-origin configuration is wrong | Validate CORS origin and `Authorization` header support in staging; production cutover is blocked unless all pass. |
| JWT leak is hard to revoke | Add a global admin token version to JWT payload and server state; logout, lockout, or emergency revocation increments the version and invalidates existing admin tokens. |
| localStorage JWT can be read by injected JS | Keep dependencies minimal, avoid unsafe HTML/script injection, do not log tokens, and rely on 7-day expiry plus revocation/logout for containment. |
| i18n key drift, where the same key has different translations in both apps | Copy without modifying during split; after extraction, only update `admin-interface/`. |
| API protocol changes while both admins coexist | Any `/v1/admin/*` change during compatibility must patch both frontends and be called out in the PR description. |
| Encryption helper behavior differs | Copy `interface/src/lib/helpers/encryption/` directly instead of rewriting; keep the same dependency versions. |

---

## 9. Out of Scope

- bun workspaces monorepo conversion, handled in a separate PR/plan.
- Renaming `interface/` to `mixin-interface/`, covered by prerequisite plan Phase 1.
- Any new admin UI/feature improvements beyond migration scope.
- Backend admin API changes unrelated to authentication.
- Web3 admin, such as a vault operator console.
- Multi-instance domain deployment templates such as `admin-xxx.instances.mrmarket.one`.

---

## 10. TODO Summary

- [ ] Phase 0: register progress and create empty directory.
- [ ] Phase 1: scaffold and validate build.
- [ ] Phase 2: shell + 7-day localStorage Bearer JWT auth + password/passkey login/session/logout/audit.
- [ ] Phase 3: 11 pages + helpers + i18n.
- [ ] Phase 4: unit + e2e.
- [ ] Phase 5: deploy staging/production.
- [ ] Phase 6: cutover + delete old code + update docs.
