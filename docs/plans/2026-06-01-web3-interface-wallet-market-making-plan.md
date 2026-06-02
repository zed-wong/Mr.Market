# Web3 Interface Wallet / Market-Making Mission Plan

## Final Direction

This mission completes the EVM-first `web3-interface` and server Web3 funding path around:

- `/app/market-making`
- `/app/wallet`
- `/app/deposit`
- `/app/withdraw`
- `/app/account`
- server-side `/web3/*` funding, withdrawal, and balance APIs

The final product direction is:

- EVM first.
- Keep SIWE + JWT authentication.
- Do not put the whole app behind a global login wall.
- Show normal public/read-only screens to disconnected visitors.
- Require login only at action/private-data boundaries.
- Solidity is a stateless Router, not a custody vault.
- Users fund orders by calling the Router.
- The Router forwards supported ERC-20 funds to the static server-held receiver address and emits events.
- Withdrawals start from a user Router event; the Router does not pay out.
- The server listens to Router events, validates them, mutates the ledger, creates orders, and performs server-mediated payouts/moves.
- Ledger remains the source of truth.
- Product funding is order-attributed; no durable generic user wallet balance exists beyond UI projections.
- The implemented compatibility key remains `orderId + assetId`, with EVM tokens normalized into an EVM asset identity so existing ledger/order code stays consistent.

The detailed selected design is recorded in [`2026-06-02-web3-router-funding-request-first-design.md`](2026-06-02-web3-router-funding-request-first-design.md).

## Completed Implementation

### 1. Auth and browse-first app behavior

Implemented:

- Reown/AppKit wallet connection.
- SIWE nonce/sign/login/session/logout flow.
- JWT persistence and session validation.
- Expired/invalid session handling.
- Validation-only wallet runtime for browser automation.
- No global `/app/*` login wall.
- Public/read-only market-making screens render for disconnected visitors.
- Login is required only when a protected API/action needs it.

### 2. Market-making UX

Implemented:

- Browse-first `/app/market-making` order-management surface.
- Status-first order cards/compact rows.
- Pure-market-making-only create flow.
- Pair/funds/review step flow.
- Wallet approval/signing before Router funding.
- Order detail page with lifecycle controls, order-scoped balances, PnL/fees/spread capture, funding actions, and event history.
- Validation fixtures for empty and larger order-list states.

### 3. Router contract

Implemented:

- `contracts/MrMarketRouter.sol`.
- Router `routeFunds(...)` call:
  - validates supported token;
  - transfers ERC-20 funds from `msg.sender` to the current server receiver;
  - emits `FundsRouted` with request/user/token/amount/payload/receiver evidence.
- Router `requestWithdrawal(...)` call:
  - validates supported token;
  - emits `WithdrawalRequested` with request/user/token/amount/recipient/payload evidence;
  - does not transfer payout funds.
- Owner-managed receiver update.
- Owner-managed supported token list.
- No Router balances.
- No Router order creation.
- No Router ledger mutation.
- Server ABI export and static contract coverage.

### 4. Server Router funding flow

Implemented:

- Funding request persistence.
- Router event-log persistence.
- `GET /web3/funding-requests/instructions` for Router receiver/token metadata.
- `POST /web3/funding-requests` to prepare Funding Request First order funding.
- `GET /web3/funding-requests/:id` for status.
- `POST /web3/funding-requests/:id/verify` to verify a Router `FundsRouted` receipt.
- Background Router event polling for pending funding requests.
- Verified `FundsRouted` events create the actual market-making order through the existing order-create path.
- Order funding ledger entries remain immutable, idempotent, and order-scoped.
- Event mismatch rejects ledger/order mutation.

### 5. Server Router withdrawal flow

Implemented:

- Withdrawal request persistence refactored to request/event/payout lifecycle.
- `POST /web3/withdrawal-requests` to prepare a withdrawal request.
- `GET /web3/withdrawal-requests/:id` for status.
- `POST /web3/withdrawal-requests/:id/verify` to verify a Router `WithdrawalRequested` receipt.
- Background Router event polling for pending withdrawal requests.
- Verified withdrawal events debit the order-scoped ledger idempotently.
- Server-mediated payout uses existing Web3 signer transfer helpers when configured.
- If payout credentials are unavailable, status records blocked evidence instead of pretending success.

### 6. Web3 interface Router UX

Implemented:

- `/app/market-making/order/new` now prepares a funding request, approves ERC-20 spending, calls Router `routeFunds`, waits for receipt, verifies the event with the server, and navigates to the created order.
- `/app/withdraw` now prepares a withdrawal request, calls Router `requestWithdrawal`, waits for receipt, verifies the event with the server, and polls server status.
- `/app/deposit` no longer presents ordinary receiving-address + tx-hash submission as the primary UX; it directs users to order funding through Router flow.
- Wallet-like displays remain ledger-derived projections.
- Router address uses `PUBLIC_ETHEREUM_ROUTER_ADDRESS`; the frontend no longer falls back to the old vault env name.

## Validation

Completed checks:

- Server focused Web3 tests:
  - `src/modules/web3/deposit/web3-deposit.service.spec.ts`
  - `src/modules/web3/withdraw/web3-withdraw.service.spec.ts`
  - `src/modules/web3/withdraw/web3-withdraw.controller.spec.ts`
  - `src/modules/web3/funding/web3-funding.service.spec.ts`
  - `src/modules/web3/contracts/mr-market-router.contract.spec.ts`
  - `src/modules/web3/web3-router-event-poller.service.spec.ts`
- Server build: `bun run build`.
- `web3-interface` check: `bun run check`.
- `web3-interface` API helper unit tests: `bun run test:unit src/lib/helpers/api/web3.test.ts`.

## Final State

The plan is complete for the local implementation scope:

- Router replaces the old vault-style funding surface.
- Funding Request First is implemented.
- Router event-backed order creation is implemented.
- Router event-backed withdrawal processing is implemented.
- Server-side Router event polling is implemented for pending funding and withdrawal requests, while receipt verify endpoints remain as a fast confirmation path and share the same idempotent processors.
- The web3 app remains browse-first and no longer forces login globally.
- Old ordinary transfer-hash deposit and direct REST withdrawal flows are superseded by Router funding and withdrawal request flows.

Out of scope for this mission:

- Real Sepolia/mainnet deployment.
- Production operator private-key provisioning.
- Historical backfill for unattributed direct transfers that were never prepared as funding/withdrawal requests.
