# Future Web3 Interface Server Endpoint and Data Contracts

## Status and Scope

This document defines **future server requirements** for making the mocked `web3-interface` prototype real. These endpoints and contracts are **not implemented in this mission**, validators must not call them during prototype validation, and the current Web3 interface must continue to use deterministic local mocks until a future server integration milestone replaces those mocks.

The scope is limited to the prototype's in-scope Web3 surfaces:

- Auth/session and wallet-linked account state.
- Cross-chain EVM and Solana/SVM wallet models.
- Balances, deposits, withdrawals, and funding activity.
- Campaign discovery, campaign creation, and market-making participation.
- Market-making order creation, detail, execution metrics, logs, and activity.
- Unsupported-chain responses, chain-specific validation/errors, retry-safe mutations, idempotency, and duplicate submission handling.

This document intentionally excludes swap and spot trading endpoint requirements. It must not be read as a requirement to add `/web3/swap`, `/web3/spot`, `/swap/*`, `/spot/*`, spot-order history, spot execution, or swap quote/submit endpoints for this prototype.

## UI Surfaces Consuming These Contracts

| UI surface or flow | Current mocked source | Future contract groups |
| --- | --- | --- |
| Login/session | `web3-interface/src/routes/login/+page.svelte`, `src/lib/stores/auth.ts`, `src/lib/helpers/siwe/siwe.ts` | Auth nonce, wallet signature login, session refresh, logout |
| Top wallet/session controls | `src/lib/stores/wallet.ts`, `src/lib/components/topBar/TopBar.svelte` | Linked wallets, active account, chain support, unsupported-chain errors |
| Home portfolio summary | `src/routes/+page.svelte`, `src/lib/stores/balances.ts`, `src/lib/helpers/mock-web3.ts` | Account summary, balances, recent activity |
| Wallet/Funding | `src/routes/wallet/+page.svelte` | Balances, deposit/withdraw availability, funding activity |
| Deposit flow | `src/routes/deposit/+page.svelte`, `src/lib/stores/funding.ts` | Deposit instructions, supported assets, deposit status/timeline |
| Withdraw flow | `src/routes/withdraw/+page.svelte`, `src/lib/stores/funding.ts` | Destination validation, fee quote, submit, withdraw status/timeline |
| Campaign discovery/detail | `src/routes/market-making/+page.svelte`, `src/routes/market-making/campaign/[id]/+page.svelte` | Campaign list/detail, filters, eligibility, requirements |
| Campaign creation | `src/routes/market-making/create/+page.svelte`, `src/lib/stores/market-making.ts` | Campaign create draft, validation, submit, created campaign detail |
| Market-making order creation | `src/routes/market-making/order/new/+page.svelte` | Draft, fee estimate, confirmation, submit, duplicate-safe lifecycle |
| Market-making order detail | `src/routes/market-making/order/[id]/+page.svelte` | Order detail, execution metrics, execution logs, lifecycle status |
| Account/activity | `src/routes/account/+page.svelte` | Account/session summary, linked wallets, funding/campaign/order activity |
| Legacy `/market` safety surface | `src/routes/market/+page.svelte` | Future redirect/alias to campaign discovery only, not spot market data |

## Cross-Cutting API Conventions

### Base Versioning

Future endpoints should be versioned under a Web3 API namespace such as `/api/v1/web3/*`. Existing mock helper names under `src/lib/helpers/api/*` are useful references, but this document is the future contract source for the Web3 integration milestone.

### Authentication

Authenticated endpoints require a bearer session token created by the wallet signature login flow. Public campaign discovery may allow unauthenticated reads, but account-specific balances, funding, withdrawals, campaign creation, order creation, and account activity must require an authenticated session.

### Monetary Values

All token and USD amounts must be decimal strings, never JavaScript numbers. Server calculations must preserve project invariants: immutable ledger entries are the source of truth for all balance changes, market-making balance is scoped by `orderId + asset`, and all typed mutations must be idempotent and transactional.

### Common Response Envelope

```json
{
  "data": {},
  "requestId": "req_01HY...",
  "serverTime": "2026-05-23T09:00:00.000Z"
}
```

### Common Error Envelope

```json
{
  "error": {
    "code": "unsupported_chain",
    "message": "Polygon is not supported for Web3 funding.",
    "retryable": false,
    "fieldErrors": {
      "chainId": "Switch to Ethereum, Sepolia, or Solana."
    },
    "details": {
      "namespace": "evm",
      "chainId": "137",
      "supportedChains": ["eip155:1", "eip155:11155111", "solana:mainnet"]
    }
  },
  "requestId": "req_01HY...",
  "serverTime": "2026-05-23T09:00:00.000Z"
}
```

## Shared Data Contracts

### Chain Namespace

```ts
type WalletNamespace = 'evm' | 'solana';

interface ChainRef {
  namespace: WalletNamespace;
  caip2: string;              // e.g. eip155:1, eip155:11155111, solana:mainnet
  chainId: string | null;     // EVM decimal chain ID, null for Solana when CAIP-2 is enough
  networkName: string;
  supported: boolean;
}
```

### Web3 Account

```ts
interface Web3Account {
  accountId: string;
  namespace: WalletNamespace;
  address: string;
  caip10: string;             // e.g. eip155:1:0x..., solana:mainnet:...
  chain: ChainRef;
  label?: string;
  linkedAt: string;
  lastSeenAt: string;
  status: 'active' | 'unsupported_chain' | 'disconnected';
}
```

### Asset and Balance

```ts
interface AssetRef {
  assetId: string;
  namespace: WalletNamespace;
  caip2: string;
  tokenAddress: string | null;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  depositEnabled: boolean;
  withdrawEnabled: boolean;
}

interface BalanceEntry {
  accountId: string;
  asset: AssetRef;
  availableAmount: string;
  reservedAmount: string;
  pendingDepositAmount: string;
  pendingWithdrawAmount: string;
  usdValue: string;
  updatedAt: string;
}
```

### Activity Entry

```ts
interface Web3ActivityEntry {
  id: string;
  accountId: string;
  namespace: WalletNamespace;
  category: 'funding' | 'campaign' | 'order';
  type:
    | 'deposit_detected'
    | 'deposit_credited'
    | 'withdraw_submitted'
    | 'withdraw_reviewing'
    | 'campaign_created'
    | 'campaign_joined'
    | 'order_created'
    | 'order_status_changed'
    | 'execution_log';
  title: string;
  detail: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
  occurredAt: string;
  href: string;               // in-scope route only: deposit, withdraw, campaign, order
  references: {
    depositId?: string;
    withdrawId?: string;
    campaignId?: string;
    orderId?: string;
    ledgerEntryId?: string;
  };
}
```

## Auth and Session Endpoints

### `POST /api/v1/web3/auth/nonce`

Consumed by: login surface and future wallet-linking prompts.

Purpose: create a short-lived nonce and canonical message fields for wallet signature.

Request:

```json
{
  "namespace": "evm",
  "address": "0xA11CE00000000000000000000000000000000001",
  "caip2": "eip155:1"
}
```

Response:

```ts
interface NonceResponse {
  nonce: string;
  domain: string;
  statement: string;
  uri: string;
  issuedAt: string;
  expiresAt: string;
  chain: ChainRef;
}
```

Validation and errors:

- `unsupported_namespace` for namespaces other than EVM or Solana/SVM.
- `unsupported_chain` when `caip2` is not enabled.
- `invalid_address` for malformed EVM hex or Solana base58 addresses.
- Nonces are one-time use and expire quickly.

### `POST /api/v1/web3/auth/login`

Consumed by: login flow after the future real wallet signs a message.

Request:

```ts
interface Web3LoginRequest {
  namespace: WalletNamespace;
  address: string;
  caip2: string;
  message: string;
  signature: string;
}
```

Response:

```ts
interface LoginResponse {
  accessToken: string;
  userId: string;
  account: Web3Account;
  expiresAt: string;
}
```

Duplicate handling: replayed nonce/signature pairs must return `nonce_already_used` and never create a second session.

### `GET /api/v1/web3/session`

Consumed by: shell topbar, account page, and route guards.

Response:

```ts
interface SessionResponse {
  authenticated: boolean;
  userId?: string;
  activeAccount?: Web3Account;
  linkedAccounts: Web3Account[];
}
```

### `POST /api/v1/web3/logout`

Consumed by: account page and topbar disconnect/session controls.

Behavior: invalidates the current server session. It does not unlink wallets or broadcast wallet transactions.

## Wallet Linking and Account Endpoints

### `GET /api/v1/web3/accounts`

Consumed by: top controls, account page, account switcher, and namespace-specific UI labels.

Response:

```ts
interface AccountsResponse {
  activeAccountId: string | null;
  accounts: Web3Account[];
  supportedChains: ChainRef[];
}
```

### `POST /api/v1/web3/accounts/link`

Consumed by: future account-link flow when adding another EVM or Solana wallet.

Request:

```ts
interface LinkAccountRequest {
  namespace: WalletNamespace;
  address: string;
  caip2: string;
  message: string;
  signature: string;
}
```

Response: `Web3Account`.

Idempotency: linking the same `userId + namespace + caip10` returns the existing account with `200 OK` and must not create duplicates.

### `PATCH /api/v1/web3/accounts/active`

Consumed by: account switch controls and all namespace-dependent UI surfaces.

Request:

```json
{ "accountId": "acct_01HY..." }
```

Response: `SessionResponse`.

### Unsupported-Chain Contract

Unsupported chains must return the same machine-readable error shape across accounts, balances, funding, campaigns, and orders:

```ts
interface UnsupportedChainErrorDetails {
  namespace: WalletNamespace;
  caip2: string;
  chainId: string | null;
  networkName?: string;
  supportedChains: ChainRef[];
  recoverableBySwitchingChain: boolean;
}
```

## Balance Endpoints

### `GET /api/v1/web3/balances`

Consumed by: home summary, wallet page, deposit asset selection, withdraw balance context, campaign/order funding checks.

Query parameters:

- `accountId` optional; defaults to active account.
- `namespace` optional filter.
- `includePending=true` to include pending deposit/withdraw amounts.

Response:

```ts
interface BalancesResponse {
  account: Web3Account;
  balances: BalanceEntry[];
  totalUsdValue: string;
  fundingAvailability: {
    canDeposit: boolean;
    canWithdraw: boolean;
    blockedReason?: 'disconnected' | 'unsupported_chain' | 'no_supported_assets';
  };
}
```

Ledger invariant: the response must be assembled from immutable ledger entries and order-attributed reservations, not in-memory balances.

## Deposit Endpoints

### `GET /api/v1/web3/deposits/instructions`

Consumed by: deposit page chain/asset selector and campaign low-balance funding CTA.

Query parameters:

- `accountId`
- `assetId`
- `caip2`

Response:

```ts
interface DepositInstructions {
  account: Web3Account;
  asset: AssetRef;
  depositAddress: string;
  memo?: string;
  minDepositAmount: string;
  confirmationsRequired: number;
  expiresAt?: string;
  instructions: string[];
}
```

Errors:

- `unsupported_chain`
- `asset_not_depositable`
- `address_generation_failed` with `retryable: true` only if no address was persisted.

### `GET /api/v1/web3/deposits/:depositId`

Consumed by: deposit timeline/status and activity detail links.

Response:

```ts
interface DepositStatus {
  depositId: string;
  accountId: string;
  asset: AssetRef;
  amount: string;
  status: 'address_generated' | 'detected' | 'confirming' | 'credited' | 'failed';
  chainTxHash?: string;
  confirmations: number;
  requiredConfirmations: number;
  ledgerEntryId?: string;
  timeline: TimelineStep[];
}
```

Deposit duplicate handling:

- Credit identity must be keyed by `namespace + caip2 + chainTxHash + logIndex/outputIndex + assetId + depositAddress`.
- Re-processing the same chain event must return the already-created `depositId`/`ledgerEntryId` and must never double-credit a balance.

## Withdrawal Endpoints

### `POST /api/v1/web3/withdrawals/validate`

Consumed by: withdraw form inline validation and confirmation readiness.

Request:

```ts
interface WithdrawValidationRequest {
  accountId: string;
  assetId: string;
  caip2: string;
  destinationAddress: string;
  amount: string;
}
```

Response:

```ts
interface WithdrawValidationResponse {
  valid: boolean;
  normalizedDestination?: string;
  feeAmount?: string;
  receiveAmount?: string;
  fieldErrors: Record<string, string>;
}
```

Chain-specific validation:

- EVM destinations must be `0x` addresses with 40 hexadecimal characters and may include checksum validation.
- Solana destinations must be valid base58 public keys and must not accept EVM `0x` addresses.
- Amount validation must reject empty, non-numeric, zero, negative, too many decimals, below minimum, above available, and unsupported asset/chain combinations.

### `POST /api/v1/web3/withdrawals`

Consumed by: withdraw confirmation submit.

Required header: `Idempotency-Key`.

Request:

```ts
interface WithdrawSubmitRequest {
  accountId: string;
  assetId: string;
  caip2: string;
  destinationAddress: string;
  amount: string;
  feeQuoteId: string;
  clientRequestId: string;
}
```

Response:

```ts
interface WithdrawStatus {
  withdrawId: string;
  status: 'submitted' | 'reviewing' | 'broadcast_queued' | 'broadcasted' | 'completed' | 'failed' | 'cancelled';
  accountId: string;
  asset: AssetRef;
  amount: string;
  feeAmount: string;
  destinationAddress: string;
  chainTxHash?: string;
  ledgerEntryIds: string[];
  timeline: TimelineStep[];
}
```

Duplicate handling:

- Reusing the same idempotency key with the same body returns the original `WithdrawStatus`.
- Reusing the same idempotency key with a different body returns `idempotency_key_conflict`.
- Server must reserve funds transactionally before returning success.

### `GET /api/v1/web3/withdrawals/:withdrawId`

Consumed by: submitted withdraw timeline and funding activity links.

Response: `WithdrawStatus`.

## Campaign Endpoints

### `GET /api/v1/web3/campaigns`

Consumed by: campaign discovery list, filters, loading/empty/error states, and public discovery while disconnected.

Query parameters:

- `namespace=evm|solana`
- `status=open|active|paused|completed`
- `eligibleForAccountId`
- `asset`
- `cursor`
- `limit`

Response:

```ts
interface CampaignListResponse {
  campaigns: CampaignSummary[];
  nextCursor: string | null;
  filtersApplied: Record<string, string>;
}

interface CampaignSummary {
  campaignId: string;
  name: string;
  status: 'open' | 'active' | 'paused' | 'completed';
  supportedChains: ChainRef[];
  supportedAssets: AssetRef[];
  liquidity: string;
  volume: string;
  minimumContributionUsd: string;
  summary: string;
  durationLabel: string;
  rewardRateLabel: string;
  participants: number;
  eligibility?: CampaignEligibility;
}
```

### `GET /api/v1/web3/campaigns/:campaignId`

Consumed by: campaign detail, terms, metrics, and join/create action state.

Response:

```ts
interface CampaignDetail extends CampaignSummary {
  terms: string[];
  requirements: string[];
  metrics: {
    liquidityGoal: string;
    volumeGoal: string;
    currentLiquidity: string;
    currentVolume: string;
    projectedReward: string;
  };
  userParticipation?: {
    hasJoined: boolean;
    orderIds: string[];
  };
}
```

### `POST /api/v1/web3/campaigns/validate`

Consumed by: campaign creation form inline validation.

Request: proposed name, supported namespace, supported assets, minimum contribution, timing/status, liquidity target, volume target, and terms.

Response:

```ts
interface CampaignValidationResponse {
  valid: boolean;
  fieldErrors: Record<string, string>;
  warnings: string[];
}
```

### `POST /api/v1/web3/campaigns`

Consumed by: mocked campaign creation success flow.

Required header: `Idempotency-Key`.

Response: `CampaignDetail`.

Duplicate handling: `Idempotency-Key` plus authenticated `userId` prevents duplicate campaign creation on retries or double-clicks.

## Market-Making Order Endpoints

### `POST /api/v1/web3/market-making/orders/draft`

Consumed by: order form draft handling and direct route safety.

Request:

```ts
interface OrderDraftRequest {
  campaignId: string;
  accountId: string;
  namespace: WalletNamespace;
  selectedAssetIds: string[];
  contributionAmountUsd: string;
}
```

Response:

```ts
interface MarketMakingDraft {
  draftId: string;
  campaign: CampaignSummary;
  account: Web3Account;
  selectedAssets: AssetRef[];
  contributionAmountUsd: string;
  validation: OrderValidationResponse;
  updatedAt: string;
}
```

### `POST /api/v1/web3/market-making/orders/quote`

Consumed by: fee estimate/review step before approval/signing/submission.

Request: `draftId` or full draft body.

Response:

```ts
interface OrderFeeQuote {
  quoteId: string;
  expiresAt: string;
  campaignFee: string;
  liquidityContribution: string;
  expectedVolume: string;
  expectedProfit: string;
  requiredReservations: {
    assetId: string;
    amount: string;
  }[];
}
```

### `POST /api/v1/web3/market-making/orders`

Consumed by: final create/join market-making order submit.

Required header: `Idempotency-Key`.

Request:

```ts
interface CreateMarketMakingOrderRequest {
  draftId: string;
  quoteId: string;
  clientRequestId: string;
}
```

Response:

```ts
interface MarketMakingOrder {
  orderId: string;
  campaignId: string;
  accountId: string;
  namespace: WalletNamespace;
  status: 'draft' | 'pending' | 'approval' | 'signing' | 'submitted' | 'active' | 'completed' | 'failed' | 'cancelled' | 'paused';
  assets: AssetRef[];
  contributionAmount: string;
  feeEstimate: string;
  liquidityContribution: string;
  expectedVolume: string;
  expectedProfit: string;
  createdAt: string;
  updatedAt: string;
}
```

Server invariants:

- Reserves are scoped by `orderId + asset`.
- Order creation must use a typed order ledger/reservation path, not generic balance adjustments.
- External order placement is not performed by request handlers; future intent workers own exchange mutation and state transitions.

Duplicate handling:

- Same idempotency key and body returns the original order.
- Same user/campaign/account/body submitted quickly without idempotency key should return `duplicate_submission_detected` with the existing candidate order when safe.

### `GET /api/v1/web3/market-making/orders`

Consumed by: My Campaigns/Orders and account/order activity.

Query parameters: `accountId`, `campaignId`, `namespace`, `status`, `cursor`, `limit`.

Response:

```ts
interface OrderListResponse {
  orders: MarketMakingOrder[];
  nextCursor: string | null;
}
```

### `GET /api/v1/web3/market-making/orders/:orderId`

Consumed by: order detail page.

Response:

```ts
interface MarketMakingOrderDetail extends MarketMakingOrder {
  metrics: ExecutionMetrics;
  logs: ExecutionLogEntry[];
  campaign: CampaignSummary;
}
```

## Execution Metrics and Logs

### `GET /api/v1/web3/market-making/orders/:orderId/metrics`

Consumed by: order detail execution visibility cards.

```ts
interface ExecutionMetrics {
  createdVolume: string;
  profit: string;
  placedOrders: number;
  filledAmount: string;
  successCount: number;
  failureCount: number;
  cancelCount: number;
  lastReconciledAt: string | null;
  reconciliationStatus: 'matched' | 'pending' | 'mismatch_blocking';
}
```

### `GET /api/v1/web3/market-making/orders/:orderId/logs`

Consumed by: chronological execution log timeline.

Query parameters: `cursor`, `limit`, `level`, `since`.

```ts
interface ExecutionLogEntry {
  logId: string;
  orderId: string;
  timestamp: string;
  label: string;
  outcome: string;
  status: MarketMakingOrder['status'];
  level: 'info' | 'warning' | 'error';
  retryable: boolean;
  attempt: number;
  correlationId: string;
}
```

Retry semantics:

- Retryable exchange placement failures must include `retryable: true`, attempt count, next retry time when applicable, and correlation IDs.
- Terminal failures must include `retryable: false` and a stable reason code.
- Reconciliation mismatches must block risk-increasing operations until resolved.

## Activity Endpoints

### `GET /api/v1/web3/activity`

Consumed by: home recent activity, wallet funding activity, account page, campaign/order activity links.

Query parameters: `accountId`, `category`, `namespace`, `cursor`, `limit`.

Response:

```ts
interface ActivityResponse {
  entries: Web3ActivityEntry[];
  nextCursor: string | null;
}
```

Activity links must route only to in-scope Web3 prototype destinations: deposit status, withdraw status, campaign detail, or market-making order detail. Activity must not link to swap, spot, spot-order history, or generic trading screens.

## Validation and Error Code Catalog

| Code | Used by | Meaning |
| --- | --- | --- |
| `unauthenticated` | account, balances, funding, orders | Session token is missing or expired |
| `unsupported_namespace` | auth, accounts, funding, campaigns | Namespace is not EVM or Solana/SVM |
| `unsupported_chain` | accounts, balances, funding, campaigns, orders | Chain is not enabled for the requested action |
| `invalid_address` | auth, accounts, withdraw | Address fails namespace-specific validation |
| `asset_not_supported` | balances, funding, orders | Asset cannot be used on the selected chain |
| `asset_not_depositable` | deposits | Deposits are disabled for the asset |
| `asset_not_withdrawable` | withdrawals | Withdrawals are disabled for the asset |
| `amount_invalid` | withdraw, order quote/create | Amount is empty, non-numeric, zero, negative, or too precise |
| `amount_below_minimum` | withdraw, campaign/order | Amount is below withdraw or campaign minimum |
| `insufficient_balance` | withdraw, order create | Available balance cannot cover amount, fee, or reservation |
| `campaign_not_found` | campaign/order | Campaign ID does not exist or is not visible |
| `campaign_not_joinable` | order create | Campaign status or timing blocks participation |
| `idempotency_key_conflict` | mutations | Same idempotency key was reused with a different body |
| `duplicate_submission_detected` | mutations | Server found an equivalent in-flight or completed mutation |
| `retry_later` | quote/create/status | Operation is retryable after a delay |
| `reconciliation_mismatch` | order actions | Risk-increasing action is blocked by reconciliation |

## Idempotency, Retries, and Duplicate Submission Handling

All mutation endpoints that create value-bearing or user-visible state require an `Idempotency-Key` header:

- `POST /api/v1/web3/campaigns`
- `POST /api/v1/web3/withdrawals`
- `POST /api/v1/web3/market-making/orders/draft`
- `POST /api/v1/web3/market-making/orders`
- Future wallet-link mutation endpoints when a signature can be replayed.

Rules:

1. The server stores `userId + endpoint + idempotencyKey + requestBodyHash + response`.
2. Same key and same body returns the original response, including original status code where practical.
3. Same key and different body returns `idempotency_key_conflict`.
4. Validation failures may be safely retried with corrected input and a new key.
5. Network timeouts must be safe for the client to retry with the same key.
6. Duplicate double-clicks without a key should still be guarded by server-side duplicate detection for recently submitted equivalent campaign/order/withdraw requests.
7. Deposit credits are idempotent by chain-event identity, not by client key.

## Future Integration Notes

- These contracts describe future server behavior only; no endpoint implementation is part of the current Web3 UI prototype mission.
- Browser and validation flows for this mission should continue to assert UI-only behavior and absence of required business/API, RPC, real-wallet, or on-chain dependencies.
- When a future milestone implements these contracts, it must update the `web3-interface` helpers/stores to replace deterministic mock data incrementally while preserving the same user-facing flows.
