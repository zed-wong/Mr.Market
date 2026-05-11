# Plan: New Independent `web3-interface` (EVM First, SVM Later)

**Date:** 2026-05-11
**Status:** Draft
**Prerequisite Plans:**
- [2026-05-10-multichain-interface-restructure.md](./2026-05-10-multichain-interface-restructure.md)
- [2026-05-11-admin-interface-extraction.md](./2026-05-11-admin-interface-extraction.md)

---

## 1. Background and Goals

Step 4 of the multichain restructure plan calls for a new `web3-interface/` SPA so EVM (and later SVM) wallet users can use Mr.Market without a Mixin account. The existing `interface/` (to be renamed `mixin-interface/`) stays Mixin-only; nothing in it is reused at runtime.

This plan covers:

- The new `web3-interface/` app scaffolding, layout, and feature set
- Backend additions required for EVM users to coexist with Mixin users
- A minimal on-chain **Vault** contract that holds user funds and lets the operator (Mr.Market) move funds to centralized exchanges to make markets
- Phased rollout to `web3.mrmarket.one`

This plan does **not** cover:

- The SVM client (mentioned only as a future shape)
- Multi-instance / third-party operator onboarding (`instances.mrmarket.one`)
- Vault audit logistics (tracked separately under `docs/architecture/server/`)
- Identity linking (same person logged in as Mixin + EVM); a stub is left, full linking is a later plan

### Core Constraints (Must Satisfy)

- The new app is **fully independent**: no shared `node_modules`, build pipeline, or routes with `interface/` or `admin-interface/`.
- Tech stack: **Svelte 5 runes**, **latest SvelteKit + `@sveltejs/adapter-static`**, **Tailwind v4 + daisyUI v5**, **svelte-i18n**, **bun**. Same "Svelte 5 exception" already granted to `admin-interface/`.
- Wallet stack: **Reown AppKit SDK** (`@reown/appkit` + `@reown/appkit-adapter-wagmi` + viem). Reown gives us the connect modal, multi-wallet support, and account/network state without writing connector glue. No React; we use the framework-agnostic `@reown/appkit` core and bind it to Svelte stores. No RainbowKit.
- Auth: **SIWE (EIP-4361)** → server returns a 7-day JWT, stored in `localStorage` as `web3-access-token`, sent as `Authorization: Bearer`. Same shape as the new admin auth. No cookies, no CSRF.
- daisyUI semantic colors only, `capitalize` not `uppercase`, `<span>` + tailwind not `<h1>`/`<p>`. Follow `AGENTS.md`.
- Funding goes through an **on-chain Vault** contract on each supported chain. The mr.market server is the sole **admin** (single EOA from `Web3Service`) authorized to withdraw funds from the vault for market making and to send funds back to the vault when a user withdraws. v1 is intentionally pure: no multisig, no role separation, no withdrawal queue contract — the admin is trusted, just like the operator key already is for the existing Mixin custody flow.
- **Ledger remains the balance source of truth.** On-chain deposits become ledger credits via the indexer; user withdrawal requests debit the ledger before the admin pays out from the vault. Yellowpaper invariants are non-negotiable.
- First supported chain: **Ethereum mainnet** (with a testnet, e.g. Sepolia, used for end-to-end validation before mainnet). Other chains come after the Ethereum flow is green; the auth and indexer code is built generic over `chainId` from day one so adding a chain is config + a vault deploy.

---

## 2. Target Structure

```text
mrmarket/
├── interface/              # → renamed to mixin-interface/ later (separate task)
├── admin-interface/        # existing, independent
└── web3-interface/         # new deliverable for this plan
    ├── package.json        # bun, independent deps
    ├── bun.lockb
    ├── svelte.config.js    # SvelteKit + adapter-static, ssr=false, prerender=false
    ├── vite.config.ts
    ├── tailwind.config.js  # v4 CSS-only or minimal JS config
    ├── postcss.config.js
    ├── tsconfig.json
    ├── .gitignore
    ├── README.md
    ├── src/
    │   ├── app.html
    │   ├── app.css                       # Tailwind v4 + daisyUI themes (web3-light / web3-dark)
    │   ├── app.d.ts
    │   ├── hooks.client.ts               # 401 → showSessionExpired, chain-change handler
    │   ├── routes/
    │   │   ├── +layout.svelte            # Shell: top bar (wallet button + chain + theme) + bottom nav
    │   │   ├── +layout.ts                # ssr=false, prerender=false, trailingSlash='never'
    │   │   ├── +page.svelte              # Home: portfolio summary, quick actions
    │   │   ├── login/+page.svelte        # SIWE sign-in landing (also shown when token missing/expired)
    │   │   ├── market/+page.svelte       # Read-only market overview (reuse data from server)
    │   │   ├── deposit/+page.svelte      # Vault deposit flow
    │   │   ├── withdraw/+page.svelte     # Vault withdraw flow
    │   │   ├── market-making/+page.svelte# Join campaigns / view positions / claim rewards
    │   │   └── account/+page.svelte      # Connected address, sessions, link Mixin (stub)
    │   └── lib/
    │       ├── components/
    │       │   ├── common/               # Loading, EmptyState, AddressBadge, AmountInput…
    │       │   ├── wallet/               # ConnectButton, ChainPicker, SignInPanel
    │       │   ├── deposit/              # DepositForm, AssetPicker, ConfirmDialog
    │       │   ├── withdraw/             # WithdrawForm, ConfirmDialog
    │       │   ├── market/               # Same shape as mixin-interface market list
    │       │   ├── market-making/        # Campaign list, JoinDialog, PositionCard, RewardClaim
    │       │   ├── home/                 # PortfolioSummary, AssetRow
    │       │   └── topBar/ bottomNav/ skeleton/ dialogs/
    │       ├── stores/
    │       │   ├── auth.ts               # token, address, chainId, isAuthed
    │       │   ├── wallet.ts             # connector state (wagmi/core)
    │       │   ├── balances.ts           # ledger balances from server (source of truth)
    │       │   ├── market.ts
    │       │   ├── marketMaking.ts
    │       │   └── theme.ts              # web3-dark-theme localStorage key
    │       ├── helpers/
    │       │   ├── api/                  # apiFetch wrapper + per-domain modules (auth, balances, deposit, withdraw, market, market-making)
    │       │   ├── wallet/               # appkit.ts (Reown boot), bindings to Svelte stores, switchNetwork helper
    │       │   ├── vault/                # ABI + thin viem wrappers for vault.deposit (read-only client; writes go through AppKit's wallet client)
    │       │   ├── siwe/                 # buildMessage(nonce, address, chainId, domain) + AppKit `createSIWEConfig` glue
    │       │   ├── constants.ts          # PUBLIC_MRM_BACKEND_URL, PUBLIC_REOWN_PROJECT_ID, supported chains, vault addresses
    │       │   └── utils.ts
    │       ├── types/                    # shared TS interfaces (auth, balances, market, mm)
    │       └── theme/themes.ts           # toWeb3Theme()
    └── i18n/                             # en.json (default) + zh.json — web3-only keys
```

Notes:

- `(bottomNav)` / `(secondary)` route groups from `interface/` are **not** copied. The web3 app has its own nav surface — pages can sit at the top level since it is an SPA with `ssr=false`.
- The market and market-making screens are **redesigned**, not lifted, because the data model around accounts is different (chain + address vs. Mixin user id). The server-side endpoints they consume are largely the same — only the auth header changes.

---

## 3. Auth: Sign-In With Ethereum

### 3.1 Flow

```diagram
╭────────╮   1.GET /auth/web3/nonce      ╭────────╮
│ Client │──────────────────────────────▶│ Server │
│        │◀── nonce, domain, statement ──│        │
│        │                               │        │
│        │   2.wallet.signMessage(SIWE)  │        │
│        │                               │        │
│        │   3.POST /auth/web3/login     │        │
│        │   { message, signature }      │        │
│        │──────────────────────────────▶│        │
│        │◀── { jwt(7d), userId, addr } ─│        │
╰────────╯                               ╰────────╯
```

- Nonce is single-use, TTL 5 min, stored server-side keyed by `(address, chainId, nonce)`.
- Message follows EIP-4361 strictly (`domain`, `address`, `statement`, `uri`, `version=1`, `chainId`, `nonce`, `issuedAt`, `expirationTime = issuedAt + 10m`).
- Signature is verified via viem on the server (or ethers; we already depend on ethers in `Web3Service`).
- On success the server upserts a `web3_user` row keyed by `(chainId, address)` and issues a 7-day JWT.

### 3.2 Server changes — `modules/auth/web3/`

All web3 auth code lives under `server/src/modules/auth/web3/`. The directory layout is built so adding SVM (or any non-EVM chain) later is a sibling module and a discriminator on the user record, not a rewrite.

```
server/src/modules/auth/web3/
├── web3-auth.module.ts
├── web3-auth.controller.ts        # POST /auth/web3/nonce | /login | /logout
├── web3-auth.service.ts           # orchestrates nonce + login + JWT issue
├── web3-user.service.ts           # upsert + token_version revocation
├── web3-user.entity.ts            # see below
├── nonce.service.ts               # in-memory or DB nonce store, single-use, 5m TTL
├── verifiers/
│   ├── verifier.interface.ts      # interface SignatureVerifier { verify(msg, sig, addr, chainId): Promise<boolean> }
│   ├── evm-siwe.verifier.ts       # EIP-4361 verification via viem
│   └── index.ts                   # registry: chainNamespace → verifier
└── dto/                           # NonceRequestDto, LoginDto, etc.
```

- `web3_user` entity carries the chain namespace, not just `chainId`, so the same table holds future SVM users:

  ```
  web3_user (
    id              uuid pk,
    chain_namespace text   not null,   -- 'eip155' (EVM) | future: 'solana' | …
    chain_id        text   not null,   -- '1' for Ethereum mainnet; CAIP-2 chain id stringified
    address         text   not null,   -- checksummed for EVM, base58 for SVM
    mixin_user_id   uuid   null,       -- stub for future identity linking
    token_version   int    not null default 0,
    created_at      timestamptz not null,
    last_login_at   timestamptz not null,
    unique (chain_namespace, chain_id, address)
  )
  ```

- The verifier registry maps `chain_namespace → SignatureVerifier`. v1 ships only `evm-siwe`; adding SVM later means dropping a `solana-message.verifier.ts` next to it and registering it. The controller stays unchanged.
- The existing `JwtStrategy` is extended to accept either `mixin_user_id` or `web3_user_id` in the JWT payload. Downstream guards use a thin `AuthIdentity` shape `{ kind: 'mixin' | 'web3', userId }`. The `web3` variant additionally carries `{ chainNamespace, chainId, address }` for endpoints that need to know which on-chain account is talking.
- `token_version` supports revocation the same way the new admin auth does it.
- `mixin_user_id` is the seed for the future identity-linking plan; we set it via a signed proof from the Mixin side later. For now it is always `NULL`.

### 3.3 Client storage

- `localStorage` key `web3-access-token`, `web3-chain-id`, `web3-address`, `web3-dark-theme`.
- `apiFetch` mirrors the admin app: injects `Authorization: Bearer`, on 401 dispatches `showSessionExpired`, redirects to `/login`.

---

## 4. Funding via Vault Contract (v1: Ethereum, single-admin)

### 4.1 Design intent for v1

- One Vault contract on Ethereum mainnet. ETH only at first; ERC-20 support is wired in but the only configured token at launch is ETH (as `address(0)` sentinel) plus optionally USDC if it lands in scope before launch.
- **No multisig, no role separation, no on-chain withdrawal queue.** The mr.market server EOA is the sole `admin`. It can move funds out of the vault for market making and send funds back into the vault to satisfy user withdrawals. This matches the trust model already in production for the Mixin custody flow — the operator key is trusted; the contract is just an attributable rail.
- The vault still gives us two real wins over a plain hot wallet:
  - On-chain `Deposit(user, token, amount)` events that the indexer maps 1:1 to ledger credits with `(chainId, txHash, logIndex)` as the idempotency key.
  - User funds and admin's working capital live in the same contract and are auditable; the admin cannot rewrite per-user attribution.
- Future versions add multisig OWNER, CEX whitelisting, queued withdrawals, kill switch, etc. They are tracked in §10 and explicitly out of v1 scope.

### 4.2 Contract (v1 minimum surface)

`MrMarketVault.sol`, deployed once on Ethereum:

```solidity
// Roles: ADMIN (mr.market server EOA), USER (anyone). No others.
event Deposit(address indexed user, address indexed token, uint256 amount);
event AdminWithdraw(address indexed token, uint256 amount, address indexed to);   // admin → external (CEX deposit, etc.)
event UserPayout(address indexed user, address indexed token, uint256 amount);    // admin → user, settling a server-side withdraw request
event AdminRefund(address indexed token, uint256 amount);                         // admin → vault, returning working capital

function deposit(address token, uint256 amount) external payable;                 // USER → vault. token == address(0) for ETH
function adminWithdraw(address token, uint256 amount, address to) external;       // ADMIN-only. No on-chain whitelist in v1.
function userPayout(address user, address token, uint256 amount) external;        // ADMIN-only. Off-chain: gated by ledger debit.
function adminRefund(address token, uint256 amount) external payable;             // ADMIN sends working capital back into the vault
function setAdmin(address newAdmin) external;                                     // ADMIN-only. Single-key rotation; documented risk.
// view: nothing required. Per-user balances are tracked off-chain in the ledger; the contract just holds aggregate funds.
```

Notes:

- The contract intentionally does **not** track per-user balances. Attribution is the ledger's job; the contract is a custody container. This keeps the contract small enough to be obviously correct.
- `userPayout` is a separate call from `adminWithdraw` purely so the on-chain logs distinguish "moving working capital" from "settling a user withdraw"; both are admin-only and unconstrained on-chain.
- No `pause()`, no `requestWithdraw`, no whitelists in v1. If the admin key is compromised, funds are at risk — this is the same exposure as the existing Mixin operator key, and is acceptable for v1 by explicit design choice.

The full Solidity sources, deploy scripts, and audit plan live in `docs/architecture/server/vault.md` (created in Phase 0).

### 4.3 Deposit indexer (server)

- `Web3DepositIndexerService` polls the vault `Deposit(user, token, amount)` logs on Ethereum (~12s head). Code is generic over `chainId` and event topic so adding a chain later is config-only.
- Each confirmed event → idempotent ledger credit attributed to `web3_user_id`, asset resolved via `(chainNamespace='eip155', chainId, tokenAddress)` through the existing asset registry. ETH uses `address(0)`.
- Confirmation depth: 12 blocks on Ethereum mainnet, configurable per chain.
- Re-org safety: idempotency key `(chainId, txHash, logIndex)` on the ledger entry; entries below the confirmation depth never reach the ledger.

### 4.4 Withdraw flow (server)

User withdraw is **server-mediated**, not contract-queued — there is no on-chain `requestWithdraw` in v1.

1. Authenticated user POSTs `/web3/withdraw` `{ token, amount, to }`. Server runs the standard ledger debit (typed, idempotent, attributable). Insufficient balance → 4xx, no on-chain action.
2. The withdraw worker picks up the request. If working capital in the vault is sufficient, it calls `vault.userPayout(user, token, amount)`. If not, it first issues `adminRefund` from a hot wallet (or pulls back from a CEX, reusing the existing intent worker) until the vault has enough, then `userPayout`.
3. Indexer reconciles the on-chain `UserPayout` event back to the ledger row as `completed`. On revert/timeout the existing typed reversal path credits the user back with `refType='web3_withdraw_failed'` and the tx evidence.

### 4.5 Vault → CEX (admin withdraw)

- The existing market-making intent worker decides when to top up exchange accounts. For web3-sourced funds the worker calls a new EVM funding adapter that issues `vault.adminWithdraw(token, amount, cexDepositAddress)`, then waits for the CEX deposit confirmation, then credits the exchange-side reservation ledger row.
- CEX deposit addresses per `(exchange, chainId, token)` are part of operator config. **There is no on-chain whitelist in v1**, so misconfig is caught only by ledger reconciliation; this is acceptable because the same EOA is authoring both the config and the call.

---

## 5. Feature Set (v1)

| Screen | Server endpoints reused | Notes |
|---|---|---|
| Home (`/`) | `GET /balances`, `GET /portfolio/summary` | New endpoints if not present; otherwise reuse |
| Market (`/market`) | `GET /market/pairs`, `GET /market/ticker` | Same data, web3-styled list |
| Deposit (`/deposit`) | `GET /web3/deposit/instructions`, on-chain `vault.deposit` | Shows vault address + token approve + deposit tx |
| Withdraw (`/withdraw`) | `POST /web3/withdraw` | One-step UX: form submit → server debits ledger → admin pays out from vault. No user-side tx needed. |
| Market making (`/market-making`) | `GET /campaigns`, `POST /campaigns/:id/join`, `GET /campaigns/:id/positions`, `POST /rewards/claim` | Existing flow; only auth header differs |
| Account (`/account`) | `GET /me`, `POST /auth/web3/logout` | Address, sessions, link-Mixin stub |
| Login (`/login`) | `POST /auth/web3/nonce`, `POST /auth/web3/login` | SIWE only |

Not in v1: swap, in-app spot trading screen, in-app messaging, admin surfaces, fiat on-ramps.

---

## 6. Wallet Layer (Reown AppKit)

- We use the **Reown AppKit SDK** (`@reown/appkit` + `@reown/appkit-adapter-wagmi` + `viem`). Reown gives us the connect modal, multi-wallet support (injected, WalletConnect v2, Coinbase, Safe…), account/network state, and SIWE message helpers in one package — no React, no glue code per connector.
- AppKit is bootstrapped once in `lib/helpers/wallet/appkit.ts`, given the project id and the chain list, then exposed through Svelte stores in `lib/stores/wallet.ts` (`address`, `chainId`, `status`, `provider`). UI components subscribe; nothing else talks to AppKit directly.
- The connect button is the AppKit web component (`<appkit-button />`) wrapped in a thin Svelte component so styling matches daisyUI. Connect modal styling is themed via Reown's theme variables to track our daisyUI light/dark themes.
- Chain config in `lib/helpers/constants.ts` is the single source of truth for `(chainNamespace, chainId, rpcUrl, vaultAddress, blockExplorer, confirmations)`. The same chain list is passed to AppKit at boot and must match `Web3Service` on the server.
- v1 ships **Ethereum mainnet** plus a testnet (Sepolia) for E2E. Adding a chain later means appending to the constants list and deploying a vault — no additional connector code.
- No automatic chain switching during sign-in. If the user is on the wrong chain we show a "Switch network" CTA that calls AppKit's `switchNetwork`.
- SIWE: we use AppKit's `createSIWEConfig` (or build the message ourselves with viem) — either way, only the `nonce` comes from our server, and the signed message is sent back to `POST /auth/web3/login`. The server verifier remains the source of truth.

---

## 7. Backend Additions Summary

| Module | Status | Change |
|---|---|---|
| `modules/auth/web3/` | new | Nonce + login + logout controller, verifier registry (EVM SIWE in v1), `web3_user` entity, JwtStrategy extension. Designed chain-agnostic (`chainNamespace + chainId`). |
| `modules/web3` | exists | Add `VaultClient` (viem-based wrappers around `vault.deposit / adminWithdraw / userPayout / adminRefund` using the existing `Web3Service` signer), `Web3DepositIndexerService`, `Web3WithdrawService`. |
| `modules/mixin` user module | exists | Refactor to live behind a shared `IdentityService` that resolves `AuthIdentity → ledger user id`. Mixin path unchanged. |
| `modules/market-making` intents | exists | Add an EVM funding adapter on the existing intent worker that calls `vault.adminWithdraw` for CEX top-ups, reusing existing reservation and reconciliation paths. |
| `common/entities` | exists | Add `web3_user`, `web3_deposit`, `web3_withdraw_request`. All carry `(chainNamespace, chainId, txHash, logIndex)` for idempotency. |
| `config` | exists | Add `web3.vaults.<chainId>.address`, `web3.vaults.<chainId>.confirmations`, `web3.cex_deposit_addresses` |

**Yellowpaper compliance** (non-negotiable):

- No new generic balance-adjustment path. Deposits and withdrawals each get a typed, attributable ledger entry tied to the on-chain tx hash.
- Withdrawal debits the ledger before the admin broadcasts `vault.userPayout`. If the broadcast fails or reverts, the existing ledger reversal mechanism (with `refType`, `refId`, evidence) credits the user back.
- Tick remains non-blocking: indexer, admin broadcasts, and CEX top-ups run in their own workers.

---

## 8. Phased Plan

### Phase 0 — Scaffolding

- Land `docs/architecture/server/vault.md` with the v1 contract sources from §4.2, deploy script, and confirmation depth table for Ethereum.
- Scaffold `web3-interface/` with bun + Svelte 5 + SvelteKit + Tailwind v4 + daisyUI v5 + svelte-i18n + Reown AppKit. Mirror the structure used by `admin-interface/`. `bun run check` / `bun run build` green with a placeholder home page rendering an i18n key and the AppKit connect button.

### Phase 1 — Auth + shell (Ethereum, SIWE via Reown)

- Server: `modules/auth/web3/` per §3.2 — nonce + login + logout, `web3_user` entity (with `chain_namespace` discriminator), `evm-siwe` verifier, verifier registry, JwtStrategy extension. Tests for nonce reuse, expired nonce, bad signature, chain mismatch, replay across `chain_namespace`.
- Client: Reown AppKit boot, SIWE flow, `apiFetch`, auth/wallet/theme stores, top bar (AppKit connect button + chain + theme), `/login` and `/` shells, session-expired modal.
- Cutover criterion: a user can connect via the Reown modal, sign in on Ethereum, refresh, and stay signed in. Wrong network shows a switch CTA that uses AppKit's `switchNetwork`.

### Phase 2 — Vault contract + deposit (testnet first, then mainnet)

- Deploy `MrMarketVault.sol` (v1, single-admin) to Sepolia. Mainnet deploy waits for audit (see Phase 5).
- `Web3DepositIndexerService` + ledger credit path with idempotency tests (replay, re-org). 12 confirmations on mainnet, fewer on Sepolia, all configurable.
- `/deposit` screen: select asset → for ERC-20, approve → deposit; for ETH, send native value. Show indexer status until the ledger credit lands.
- Cutover criterion: a Sepolia deposit shows up as a ledger credit; replaying the event does not double-credit; reorg below depth never credits.

### Phase 3 — Withdraw (server-mediated)

- `POST /web3/withdraw` endpoint: ledger debit at request time → enqueue worker job. Insufficient balance → 4xx.
- Withdraw worker: ensure vault has enough balance (`vault.adminRefund` from hot wallet or pull from CEX if not), then call `vault.userPayout(user, token, amount)`. Reconcile via the indexer's `UserPayout` event back to the ledger row. Revert/timeout → typed reversal.
- `/withdraw` UI: pick token + amount + destination address → submit → poll status → completed/failed.
- Cutover criterion: Sepolia withdraw round-trip works, ledger and on-chain balances reconcile, deliberate revert path correctly reverses the ledger.

### Phase 4 — Market making for web3 users

- EVM funding adapter on the existing intent worker calls `vault.adminWithdraw(token, amount, cexDepositAddress)` for CEX top-ups; reuse existing CEX-side reservation and reconciliation paths.
- `/market-making` UI: list campaigns, join (deposit must be settled first), view position, claim rewards (rewards flow back into the ledger; user withdraws via Phase 3).
- Cutover criterion: a web3 user can join a campaign on Sepolia + an exchange testnet/paper account, and rewards land in the ledger.

### Phase 5 — Audit + polish + mainnet (delayed)

Phases 0–4 ship to a Sepolia-only public preview behind `web3.mrmarket.one`. Mainnet launch waits on:

- Vault audit complete and remediations applied.
- `/market` and `/account` screens, EN+ZH i18n parity.
- Playwright E2E with a mocked SIWE wallet and an anvil-forked chain (matches the testing pattern already used in `interface/`).
- Risk-limit gating on `/deposit` (TVL cap) and operational runbook for `setAdmin` rotation.

### Phase 6 — Mainnet cutover

- DNS: `web3.mrmarket.one` → `web3-interface/` static build, `api.mrmarket.one` continues to serve the server. `app.mrmarket.one` 302 alias targets `web3.mrmarket.one` for wallet UAs and `mixin.mrmarket.one` otherwise.
- Mainnet deploy of the audited vault, public launch on Ethereum. Second chain is a follow-up task that only requires config + a vault deploy + (for non-EVM) a new verifier in `modules/auth/web3/verifiers/`.

---

## 9. Verification

For each phase the same green-light bar applies:

- `bun install`, `bun run check`, `bun run build` green in `web3-interface/`
- `bun run test` green for new server modules (unit + integration as in the rest of `server/`)
- Manual E2E with a real wallet (MetaMask) on testnet
- Yellowpaper invariants: no balance change without a ledger entry; every on-chain mutation has a unique idempotency key; no path mutates balance outside the typed deposit/withdraw/reward flows
- Reconciliation job (existing) tolerates the new ledger ref types

---

## 10. Decisions and Deferrals

**Decided for v1:**

1. **First chain: Ethereum mainnet** (Sepolia for testnet validation).
2. **Wallet stack: Reown AppKit** (`@reown/appkit` + `@reown/appkit-adapter-wagmi` + viem).
3. **Vault: single-admin, no multisig, no on-chain whitelist, no kill switch.** Server EOA is `admin`; trust model matches the existing Mixin operator key. Contract is immutable (no proxy); a v2 vault would be a fresh deploy + migration.
4. **Withdraw: server-mediated**, not contract-queued. No on-chain `requestWithdraw` in v1.

**Explicitly deferred (not v1):**

- **Multisig OWNER + role separation + CEX whitelist + `pause()`** on the vault. Plan a v2 contract once the v1 flow is live and we have real volume to justify the audit cost.
- **Additional chains** (other EVMs, SVM). Code is generic over `chainNamespace + chainId` from day one (auth verifier registry, indexer, asset resolution, AppKit chain list); shipping a new chain is config + a vault deploy + an SVM verifier when applicable.
- **Identity linking** (same person logged in as Mixin + EVM). `web3_user.mixin_user_id` is the stub; the linking ceremony gets its own plan once both interfaces are live.
- **Multi-instance / third-party operators.** `PUBLIC_MRM_BACKEND_URL` is the only deployment-specific value; `web3-xxx.instances.mrmarket.one` is a rebuild with a different backend URL when the multi-instance plan lands.
- **`/market`, `/account`, `/home` polish, ZH i18n parity**. Phase 5 only — we ship Phases 0–4 first.

---

## 11. Risk Register

| Risk | Mitigation |
|---|---|
| Vault bug drains funds | Contract surface is small and obviously correct (no per-user accounting on-chain, no upgrade path); audit before mainnet deploy; testnet soak before mainnet |
| Admin key compromise | Accepted v1 risk, identical exposure to the existing Mixin operator key. Mitigation deferred to a v2 vault (multisig OWNER, CEX whitelist, `pause()`). Until then: cap vault TVL via off-chain risk limits that gate `deposit` UI, monitor admin txs, rotate `setAdmin` on suspicion |
| Indexer misses an event | Idempotency key `(chainId, txHash, logIndex)`, replay-from-block tooling, periodic reconciliation between on-chain vault balance and the sum of unfilled ledger credits |
| Re-org credits then reverses | Wait 12 confirmations on Ethereum (configurable per chain) before ledger credit; ledger entries are immutable, reorgs below depth never reach them |
| User signs SIWE on a phished domain | Strict `domain` and `uri` validation server-side; reject if they don't match the issuer's known origin; nonce single-use with 5m TTL |
| `userPayout` reverts (e.g. user is a contract that rejects ETH) | Worker catches the revert, reverses the ledger debit with `refType='web3_withdraw_failed'` and tx evidence, surfaces the failure in the UI with a "change destination address" CTA |
| Reown AppKit bundle / runtime cost | Lazy-load AppKit on the `/login` and wallet-required routes; rely on its tree-shaking. If size becomes a real problem, fall back to `@wagmi/core` headless |
