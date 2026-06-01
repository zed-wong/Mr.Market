# Web3 Interface Wallet / Market-Making Mission Plan

## Context

This plan records the current mission for completing the EVM-oriented `web3-interface` around:

- `/app/market-making`
- `/app/wallet`
- `/app/deposit`
- `/app/withdraw`
- `/app/account`
- server-side `/web3/*` funding and balance APIs

The product direction was clarified during the mission:

- Do **not** put the whole app behind a global login wall.
- Users should see useful public/read-only market-making content before connecting a wallet.
- Require SIWE only at action boundaries: create order, manage private orders, view private wallet/account data, or perform funding actions.
- Market-making is direct pure market-making order creation only; no campaign UX in this mission.

## Direction Correction — Router Funding Model

After the initial EVM funding implementation, the intended on-chain design was clarified:

- The first chain remains **EVM**.
- Auth remains **SIWE + JWT**.
- The Solidity contract should be a **Router**, not a custody vault as the long-term product surface.
- User funding is **order funding**. There is no durable generic user wallet balance in the product model; any wallet-like balance shown in the UI is only a UX projection.
- Funding is initiated by the user calling the Router. The Router transfers supported ERC-20 funds from the user to a static server-held address and emits an event.
- The server is allowed to hold private keys because it must move funds from the server-held address to exchange/API-key accounts for market making.
- Withdrawal is initiated by the user calling the Router to emit a withdrawal request event. The Router does not pay out. The server listens to the event, validates ledger availability, and transfers funds to the requested recipient.
- Ledger remains the source of truth.
- The likely order funding scope is `orderId + tokenContractAddress`; whether the backend also retains `assetId` is an implementation compatibility decision because `assetId` is historically a Mixin concept.
- The server-held receiving address is a static global address, but the Router admin may update it. Historical events retain their emitted receiver evidence.
- Withdrawal request events should include requester address, recipient address, token, amount, and order identity. The order identity may need hashing or encryption for privacy; final event fields require further design.
- The server does not need to write completion evidence back on-chain because that would add unnecessary gas cost. Server status APIs and ledger entries carry completion evidence.

### Current Implementation Status After Correction

The current implementation was validated as a working EVM vault/REST funding prototype, but it is **not the final intended funding design**. It must be refactored rather than extended as-is:

- `MrMarketVault.sol` should be refactored into a Router-style Solidity contract.
- Deposit/funding UX should move from "show receiving address + submit tx hash" to "prepare/call Router funding transaction + wait for indexed Router event".
- Withdraw UX should move from direct REST mutation to "call Router withdrawal-request transaction + wait for server processing status".
- `/web3/withdraw` should stop being the primary source of withdrawal intent. It can be refactored into prepare/status APIs around Router events.
- `/web3/deposit/verify` should be refactored into Router event verification/fallback rather than ordinary transfer verification.
- `/web3/balances` should continue to expose ledger-derived order funding state.

## Completed Work

### 1. Auth milestone — complete and validated

Implemented and validated:

- Reown/AppKit SIWE login from frontend:
  - request backend nonce;
  - sign message through wallet path;
  - submit `/auth/web3/login`;
  - persist JWT;
  - validate stored session through `/auth/web3/session`.
- Validation-only wallet/runtime path for browser automation.
- `/auth/web3/logout` returns HTTP `200`.
- Invalid/expired session handling.
- Auth validation passed.

### 2. Market-making UX milestone — complete and validated

Implemented and validated:

- Browse-first `/app/market-making` behavior:
  - unauthenticated users see useful public/read-only content;
  - create/manage actions route through SIWE.
- Market-making list redesign:
  - status-first layout;
  - PnL/fees second;
  - locked funds third;
  - card layout for small lists;
  - compact layout for larger lists.
- Simplified `/app/market-making/order/new`:
  - pure market-making only;
  - no normal-user strategy picker;
  - pair → funds → review steps;
  - balance/over-allocation validation;
  - wallet approval/signing before create API call.
- Fixed create-flow browser progression issue.
- Redesigned `/app/market-making/order/[id]`:
  - lifecycle controls;
  - per-asset balances;
  - text-only PnL/fees/spread capture;
  - inline deposit/withdraw actions;
  - event history.
- Fixed order-detail funding asset IDs so payloads use backend-supported asset IDs, not parsed pair symbols.
- Added validation fixtures for empty order state and >4-order compact list state.
- Scrutiny and user-testing validation passed.

### 3. Backend APIs milestone — prototype complete, needs Router refactor

Implemented so far:

- `contracts/MrMarketVault.sol`
  - simple single-admin ERC-20 vault;
  - user deposits;
  - admin-only user payout;
  - admin withdraw/sweep;
  - events;
  - ABI export for backend consumption;
  - no deployment required.
- `GET /web3/deposit/instructions`
  - chain-specific receiving address;
  - supported token metadata.
- `POST /web3/deposit/verify`
  - validates chain/token/recipient/amount/authenticated-wallet attribution;
  - verifies transaction through `Web3Service`;
  - credits ledger idempotently.
- `GET /web3/balances`
  - authenticated endpoint;
  - ledger-derived available balances;
  - market-making funds grouped by asset while preserving `orderId + asset` scoping;
  - persisted deposit/withdraw activity.
- `POST /web3/withdraw`
  - authenticated endpoint;
  - validates supported chain/token, authenticated wallet recipient, available ledger balance, and idempotency payload;
  - records withdrawal debits through the immutable ledger;
  - persists withdrawal status and tx/failure evidence;
  - returns `blocked` when no chain signer is configured instead of pretending success.
- `GET /web3/withdraw/:withdrawalId`
  - authenticated owner-only status lookup.

## Remaining Work

### 1. Refactor funding contract into Router

Feature: `web3-router-contract`

Build/refactor:

- Replace/refactor `contracts/MrMarketVault.sol` into a Router contract.
- Router funding call should:
  - accept token, amount, order identity, and request identity;
  - transfer funds from `msg.sender` to the current server-held receiver address;
  - emit a funding event with enough data for the server to credit the ledger.
- Router withdrawal request call should:
  - accept token, amount, recipient, order identity, and request identity;
  - emit a withdrawal request event only;
  - not transfer payout funds on-chain.
- Router admin may update the static global server receiver address.
- Router should not record user balances.
- Router should not be the ledger source of truth.
- Decide final event privacy shape for order identity:
  - plaintext order id;
  - hashed order id;
  - encrypted/order nonce mapping.

### 2. Refactor server web3 funding APIs around Router events

Feature: `web3-router-event-funding`

Build/refactor:

- Add Router event verification/indexing path for funding events.
- Credit order funding ledger entries from verified Router funding events.
- Refactor `/web3/deposit/instructions` to return Router contract details, supported token metadata, receiver evidence, and prepared call parameters.
- Refactor `/web3/deposit/verify` into Router event verification/fallback.
- Refactor withdrawal creation so the primary intent source is a Router withdrawal-request event.
- Keep withdrawal status APIs for server processing status and tx evidence.
- Preserve server-mediated ERC-20 transfer helpers for payouts and moving funds to exchange/API-key accounts.
- Add ledger entries for server-held-address → exchange/API-key-account movement as soon as an order is created.

### 3. Refactor web3-interface funding UX around Router calls

Feature: `web3-router-funding-ux`

Build/refactor:

- `/app/deposit` should become order funding via Router call.
- `/app/withdraw` should create a Router withdrawal request transaction and then poll server status.
- Remove ordinary receiving-address + tx-hash submission as the main UX.
- Keep browse-first app behavior and SIWE only at action/private-data boundaries.
- Show wallet-like balances only as UI projections of ledger order funding, not as a durable generic platform wallet balance.

### 4. Resolve funding scope identity

Feature: `web3-order-funding-scope`

Open decision:

- Final order funding scope should likely be `orderId + tokenContractAddress`.
- Determine whether `assetId` remains necessary because existing backend ledger services currently rely on asset identifiers.
- If retained, define canonical EVM asset id as `evm:{chainId}:{tokenContractAddress}` and keep it as a compatibility key while treating token contract address as the product-facing funding identity.

### 5. Router milestone validation

After Router refactor is complete, run:

- contract tests for Router funding, receiver update, and withdrawal-request events;
- server web3 tests for Router event idempotency, ledger credit/debit, withdrawal event ownership/recipient behavior, and exchange/API-key transfer ledger entries;
- web3-interface check/unit/build;
- validation-wallet browser smoke for Router funding and withdrawal request flows.

### Completed prototype work retained for reuse

#### Backend withdraw APIs — prototype complete

Feature: `backend-withdraw-apis`

Built:

- `POST /web3/withdraw`
- `GET /web3/withdraw/:withdrawalId`

Delivered behavior:

- Validate authenticated user.
- Validate available ledger balance.
- Reject insufficient available balance.
- Record withdrawal debit idempotently.
- Create persisted withdrawal status:
  - `pending`
  - `submitted`
  - `completed`
  - `failed`
  - `blocked`
- Use `Web3Service.getSigner()` for server-mediated ERC-20 transfer when chain credentials are available.
- If real chain credentials are unavailable, persist and return `blocked` instead of pretending success.
- Enforce withdrawal ownership in status endpoint.
- Return tx hash or failure reason when known.

Validation assertions covered:

- `VAL-BACKEND-004`
- `VAL-BACKEND-005`

#### Backend API milestone validation — prototype complete

After withdraw APIs are done, backend-focused validation ran:

- `bun run test web3 --runInBand` in `server` — passed.
- `bun run test --runInBand` in `server` — passed.
- Scoped server lint for web3 funding/withdraw/vault files — passed.
- Server build — passed.
- Backend vault/deposit/balances/withdraw coverage validates:
  - deposit instructions;
  - deposit verification idempotency;
  - balance separation;
  - funding activity;
  - withdraw success/insufficient/blocked/status/ownership cases;
  - vault source/ABI semantics.

Completed backend assertions:

- `VAL-BACKEND-001`
- `VAL-BACKEND-002`
- `VAL-BACKEND-003`
- `VAL-BACKEND-004`
- `VAL-BACKEND-005`
- `VAL-BACKEND-006`
- `VAL-BACKEND-007`

#### Wallet real funding flows — prototype complete

Feature: `wallet-real-funding-flows`

Built:

- `/app/wallet`
- `/app/deposit`
- `/app/withdraw`

Delivered behavior:

- Replace mock/sessionStorage default flows with real API-backed state.
- `/app/wallet` fetches `/web3/balances`.
- Wallet shows two sections:
  - available funds;
  - in-market-making funds.
- Group balances by asset.
- Show server-derived funding activity.
- Wallet exposes navigation to deposit and withdraw flows.
- `/app/deposit`:
  - fetches `/web3/deposit/instructions`;
  - shows receiving address and supported tokens;
  - accepts tx hash;
  - submits `/web3/deposit/verify`;
  - updates visible balances after success.
- `/app/withdraw`:
  - validates empty/invalid amount input without BigNumber runtime errors;
  - submits `/web3/withdraw`;
  - polls `/web3/withdraw/:withdrawalId`;
  - displays pending/completed/failed/blocked status.

Validation assertions covered:

- `VAL-WALLET-001`
- `VAL-WALLET-002`
- `VAL-WALLET-003`
- `VAL-WALLET-004`
- `VAL-CROSS-001`
- `VAL-CROSS-002`
- `VAL-CROSS-003`

#### Account settings center — complete

Feature: `account-settings-center`

Built:

- `/app/account` as a settings center.

Delivered behavior:

- Show current wallet address.
- Show current network.
- Provide network switching through Reown/AppKit.
- Provide language toggle:
  - English;
  - Chinese.
- Provide light/dark theme toggle.
- Provide disconnect/logout action that clears wallet/auth state.

Validation assertions covered:

- `VAL-ACCOUNT-001`
- `VAL-ACCOUNT-002`
- `VAL-ACCOUNT-003`

#### Wallet/account milestone validation — prototype complete

After wallet and account features were completed, local validation ran:

- `bun run check` in `web3-interface` — passed.
- `bun run test:unit` in `web3-interface` — passed.
- `bun run build` in `web3-interface` — passed with dependency/chunk warnings only.
- Validation-wallet route smoke on `web3-interface` port `5177` for `/app/wallet`, `/app/deposit`, `/app/withdraw`, and `/app/account` — passed.
- API helper/unit coverage validates `/web3/balances`, `/web3/deposit/instructions`, `/web3/deposit/verify`, `/web3/withdraw`, and `/web3/withdraw/:withdrawalId` contracts.

Completed wallet/account/cross-area assertions:

- `VAL-WALLET-001`
- `VAL-WALLET-002`
- `VAL-WALLET-003`
- `VAL-WALLET-004`
- `VAL-ACCOUNT-001`
- `VAL-ACCOUNT-002`
- `VAL-ACCOUNT-003`
- `VAL-CROSS-001`
- `VAL-CROSS-002`
- `VAL-CROSS-003`

## Current Validation State Snapshot

Passed:

- all auth assertions;
- all market-making UX assertions.
- server web3 Jest suite;
- web3-interface typecheck;
- web3-interface unit suite.

Pending:

- Router contract refactor.
- Router event-backed server funding/withdrawal refactor.
- Router transaction UX refactor.
- Final order funding scope decision: `orderId + tokenContractAddress` vs compatibility `assetId` key.
- Router milestone validation.

## Important Constraints

- Use `bun`, not npm/yarn/pnpm.
- Do not read or edit `.env` files unless explicitly permitted.
- Use Reown/AppKit for wallet connect/sign/switch/disconnect.
- Use `bignumber.js` for monetary math.
- Use `getRFC3339Timestamp()` for backend timestamps.
- Preserve ledger invariants:
  - ledger is the source of truth;
  - no in-memory-only balance changes;
  - market-making funds stay order-attributed; final EVM key is likely `orderId + tokenContractAddress`, with `assetId` retained only if needed for backend compatibility;
  - all balance changes are immutable, idempotent, and transactional.
- Real Sepolia deployment is out of scope for this mission.
- The existing vault-style contract is a prototype artifact and should be refactored into Router semantics before being treated as final.

## Known Operational Notes

- Browser validation runs `web3-interface` on port `5177`.
- Server validation runs the backend on port `5001`.
- PostgreSQL is expected on localhost `5432`.
- Validation may use a validation-only wallet path gated by `PUBLIC_ENABLE_VALIDATION_WALLET=1`.
- Server Jest currently passes but may print a non-fatal open-handle warning.
- Server lint command includes `--fix`; validation used a no-fix scoped ESLint command for the web3 funding/withdraw files to avoid unrelated lint-only mutations. A repo-wide no-fix lint run still reports pre-existing formatting issues outside this mission scope.
