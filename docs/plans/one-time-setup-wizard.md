# One-time Setup Wizard — Implementation Plan

## Current State
- `/setup` is a read-only readiness dashboard requiring auth, always accessible, configures nothing
- `ADMIN_PASSWORD` must be set in `.env` before the server starts (AuthService hard-crashes without it)
- DB seeding is manual (`bun run seed`)
- Exchange API keys, Mixin, Web3, etc. all require manual `.env` editing

## Target State
- `/setup` is a **one-time, pre-auth multi-step wizard** that actually writes config
- After completion, `/setup` redirects to dashboard; a floating card shows remaining optional steps
- Minimum completion: admin password + exchange config

---

## 1. Server: `SetupStateEntity` + Migration
- New entity: `id`, `initialized`, `completedSteps` (JSON), `seededAt`, `completedAt`, `updatedAt`
- Singleton row (id=1), tracks which steps are done and whether setup is complete
- New migration file

## 2. Server: `SetupModule` + `SetupController` + `SetupService`

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /setup/status` | None | Returns `{ initialized, seededAt, completedAt, completedSteps, seedRequired }` |
| `POST /setup/password` | None | Sets admin password (only when `initialized=false`). Writes to .env, updates AuthService at runtime, sets `initialized=true`, returns JWT |
| `POST /setup/seed` | JWT | Triggers the seeder. Sets `seededAt` |
| `GET /setup/seed-status` | JWT | Checks if seed data exists (queries key tables) |
| `PATCH /setup/steps/:step` | JWT | Marks a step as completed in `completedSteps` |
| `POST /setup/complete` | JWT | Sets `completedAt`, marks setup done |
| `POST /setup/env` | JWT | Writes key-value pairs to `.env` for Mixin, Web3, etc. Only works before `completedAt` is set |

## 3. Server: Modify `AuthService`
- Add `updateAdminPassword(newPassword: string)` — updates `this.adminPassword` at runtime + writes to `.env`
- Make `ADMIN_PASSWORD` optional at startup when setup is not yet complete (currently hard-crashes)
- On boot: if `SetupStateEntity.initialized === false`, allow server to start in "setup mode"

## 4. Server: Setup Guard Middleware
- When `initialized === false`: only `/setup/*`, `/auth/passkeys/login/*`, `/health/*` endpoints are accessible
- All other routes return `503 Service Unavailable — Setup required`
- After `initialized === true`: normal access with JWT guard

## 5. Frontend: Setup Guard
- On app mount, call `GET /setup/status`
- If `initialized === false` → force redirect to `/setup` (bypasses auth)
- If `initialized === true && completedAt === null` → allow dashboard but show floating card
- If `completedAt !== null` → normal app, `/setup` redirects to `/`

## 6. Frontend: Setup Wizard Page (`/setup/+page.svelte`)
Replaces the current readiness dashboard. Step-based layout with progress indicator:

| Step | Required | Pre-auth | What it does |
|---|---|---|---|
| **1. Admin Password** | Yes | Yes | Password + confirmation → `POST /setup/password` → auto-login |
| **2. Exchange Config** | Yes | No | Pick exchanges from CCXT list → `POST /admin/grow/exchange/add` |
| **3. API Keys** | Yes | No | Inline form: exchange + key + secret → existing `POST /admin/exchanges/keys` |
| **4. Custom Config** | No | No | Fees, balance limits, funding account → `PATCH /admin/system/config` |
| **5. Mixin Credentials** | No | No | APP_ID, keys, etc. → `POST /setup/env` |
| **6. Web3 & Other** | No | No | RPC URLs, CoinGecko, Discord → `POST /setup/env`. Note: restart needed |
| **7. Database Seed** | Yes (if not seeded) | No | Auto-detect via `GET /setup/seed-status` → `POST /setup/seed` |
| **8. Review & Complete** | Yes | No | Summary → `POST /setup/complete` → redirect to `/` |

Each step has inline mini-forms calling existing admin API endpoints where possible. Optional steps have "Skip" buttons.

## 7. Frontend: Floating Setup Card (dashboard widget)
- Appears on dashboard when `initialized=true && completedAt=null`
- Shows completed vs. remaining steps
- Click to re-enter wizard at next incomplete step
- Closeable (dismissal persisted in localStorage, reappears next session)

## 8. Post-completion Behavior
- `/setup` route → redirect to `/`
- Sidebar hides setup entry
- `POST /setup/env` and `POST /setup/password` become no-ops after `completedAt` is set
- All `.env`-written values for Mixin/Web3 take effect after server restart (wizard surfaces this clearly at steps 6 and 8)

---

## Key Design Decisions
- **DB as setup state source of truth** — `SetupStateEntity` tracks completion, not `.env`
- **`.env` writes only during setup** — `POST /setup/env` is gated to only work before `completedAt`, preserving the security principle that the admin interface never writes `.env` post-setup
- **Server restart note** — Mixin, Web3, and other env-based config requires restart; the wizard surfaces this clearly
- **Existing endpoints reused** — exchange, API key, and custom config steps call existing admin API endpoints (no duplication)
- **Runtime password update** — AuthService gets a new method so the password takes effect immediately without restart

## Implementation Order
1. `SetupStateEntity` + migration
2. `SetupModule` + `SetupController` + `SetupService`
3. `AuthService` modification (runtime password update, optional ADMIN_PASSWORD at startup)
4. Setup guard middleware
5. Frontend setup guard + API helpers
6. Frontend wizard page
7. Floating setup card
8. Tests
