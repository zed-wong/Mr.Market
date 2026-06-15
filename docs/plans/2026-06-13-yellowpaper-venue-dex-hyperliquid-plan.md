# Yellowpaper Venue Execution Plan: Hyperliquid and AMM/CLMM DEX

Status: active design plan

Source of truth:

- `docs/product/yellowpaper.md`
- `docs/architecture/market-making-flow.md`
- `docs/plans/2026-06-11-ledger-order-id-user-order-id-plan.md`
- `docs/archive/plans/2026-04-19-dex-strategy-architecture-plan.md` as historical input only

## Goal

Extend Mr.Market from CEX-first execution into a venue-neutral trading layer while preserving yellowpaper invariants:

- Ledger remains the balance source of truth.
- All balances remain scoped by `ledgerOrderId + asset`.
- `userOrderId` remains the user-facing aggregation key for order detail, PnL, rewards, withdrawals, and reports.
- Risk check and ledger order scope reservation happen before any risk-increasing venue mutation.
- Controllers only produce actions or intents.
- Intent workers own reservation, venue mutation, tracking, settlement, and state transitions.
- Tick never waits on exchange I/O, chain I/O, REST fallback, or DB settlement.
- Fills, fees, gas, LP movements, withdrawals, rewards, and reversals remain attributable to one `userOrderId`; balance effects settle against one `ledgerOrderId + asset` scope.
- Reconciliation blocks risk-increasing operations on mismatch.

This plan supersedes the archived DEX LP plan as the active design direction. The archived plan correctly identified LP lifecycle gaps, but it predates the current yellowpaper implementation and does not fully cover ledger order scope balances, order identity vocabulary, reservation, reconciliation, on-chain confirmation, or Hyperliquid as a CLOB-like venue.

## Current State

Implemented or partially implemented:

- CEX CLOB execution already uses the intent-worker boundary, tracked orders, reservation, fill settlement, and reconciliation.
- Hyperliquid has partial support through the existing exchange API-key flow:
  - credentials are mapped as wallet address plus private key;
  - submitted `clientOrderId` values use Hyperliquid-compatible 128-bit hex;
  - execution still follows the CEX/CLOB path.
- AMM DEX swap support exists for volume strategy only:
  - `uniswapV3` and `pancakeV3` adapters exist;
  - `EXECUTE_AMM_SWAP` intent exists;
  - `DexVolumeStrategyService` can quote and execute `exactInputSingle`.

Missing or incomplete:

- AMM swap execution is not fully `ledgerOrderId`-settled and `userOrderId`-attributed for token spend, token receive, gas, slippage, receipt confirmation, and reconciliation.
- LP lifecycle is not implemented as first-class trading:
  - no `ADD_LIQUIDITY`, `REMOVE_LIQUIDITY`, `COLLECT_FEES`;
  - no `ledgerOrderId` / `userOrderId` attributed LP position state machine;
  - no LP ledger semantics for funds locked in external positions.
- EVM execution accounts are not first-class and are not split by key purpose.
- On-chain transaction lifecycle is not modeled as pending, confirmed, failed, replaced, or reverted.
- `clob_dex` is correctly rejected today; it must remain disabled until an actual on-chain CLOB design exists.

## Order Identity Model

The updated yellowpaper defines the order identity vocabulary below. This plan must use the same terms in all new DEX and Hyperliquid contracts:

| Name | Meaning | Primary use in this plan |
| --- | --- | --- |
| `userOrderId` | Product and user-facing order identity. | Order detail, UI/API reads, PnL, rewards, withdrawals, reporting, and every venue/on-chain attribution record. |
| `ledgerOrderId` | Balance bucket identity. | Ledger Entry, OrderBalance, reservation, fill settlement, fee settlement, swap settlement, LP settlement, gas debit, withdrawals, and reconciliation balance checks are keyed by `ledgerOrderId + asset`. |
| `accountLabel` | Execution account or strategy leg under a `userOrderId`, for example `default`, `maker`, or `taker`. It is not an order id by itself. | Exchange routing, EVM execution routing, dual-account scope resolution, tracked orders, on-chain executions, LP positions, and reconciliation reports. |
| `clientOrderId` | Client-supplied venue order id generated before order placement. | Placement idempotency and fill routing; submitted exchange-safe forms are mapped back through `ExchangeOrderMapping`. |
| `exchangeOrderId` | Venue-side order id returned by the exchange or on-chain execution venue. | Fetch, cancel, open-order reconciliation, fill matching, on-chain receipt/position matching. It must never be used as a balance scope. |

Rules:

- New service contracts must not pass a naked `orderId` when both identities are possible.
- Single-account CEX, Hyperliquid, AMM swap, and CLMM LP orders normally use `userOrderId === ledgerOrderId` with `accountLabel = 'default'`.
- Dual-account CLOB strategies share one `userOrderId` and use separate `ledgerOrderId` scopes such as maker and taker.
- If a future DEX strategy uses multiple EVM execution accounts under one user order, it must create explicit ledger scopes through the centralized ledger-order-scope helper instead of parsing suffixes locally.
- `clientOrderId` is for venue placement idempotency and routing only.
- `exchangeOrderId` is venue evidence only; it must never become a ledger balance key.
- Reconciliation reports must include `userOrderId`, `ledgerOrderId`, and `accountLabel`; balance checks stay keyed by `ledgerOrderId + asset`.

## Venue Taxonomy

Do not put Hyperliquid, Uniswap, and PancakeSwap under one "DEX" abstraction. They have different settlement and lifecycle semantics.

| Venue family | Examples | Liquidity model | Settlement domain | Target path |
| --- | --- | --- | --- | --- |
| `clob_exchange` | Binance, MEXC, Hyperliquid spot/perps if adapter-backed | Orders and fills | Exchange account | Existing CLOB intent path |
| `amm_dex` | Uniswap V3 swap, PancakeSwap V3 swap | Atomic pool swap | EVM chain | On-chain swap intent path |
| `clmm_dex` | Uniswap V3 LP, PancakeSwap V3 LP | Concentrated liquidity NFT/position | EVM chain | LP position lifecycle path |
| `clob_dex` | Future on-chain CLOB | Orders and fills on-chain | Chain or hybrid | Out of scope until designed |

Hyperliquid belongs in `clob_exchange` for this phase. It should share the same trading-layer invariants as Binance/MEXC, with venue-specific credential signing, `clientOrderId`, fee, and reconciliation handling.

Uniswap/PancakeSwap belong in `amm_dex` for swaps and `clmm_dex` for LP positions. They require on-chain transaction and receipt handling, not CLOB order ACK/fill assumptions.

## Core Design Decisions

### D1. Venue capabilities are explicit

Add a capability model to strategy definition snapshots and runtime venue resolution:

```ts
type VenueFamily =
  | 'clob_exchange'
  | 'amm_dex'
  | 'clmm_dex'
  | 'clob_dex';

type SettlementDomain = 'exchange_account' | 'evm_chain';

type VenueCapability = {
  venueId: string;
  venueFamily: VenueFamily;
  settlementDomain: SettlementDomain;
  supportedIntentTypes: string[];
  supportsOpenOrders: boolean;
  supportsAtomicSwap: boolean;
  supportsLpPositions: boolean;
  requiresOnchainConfirmations: boolean;
};
```

`strategySnapshot.resolvedConfig` must include the resolved venue and account fields used at runtime. Runtime must not infer a new venue from mutable admin definitions after order creation.

### D2. Hyperliquid stays on the CLOB path

Hyperliquid should be hardened as a `clob_exchange` adapter:

- Keep `CREATE_LIMIT_ORDER`, `CANCEL_ORDER`, tracked order, fill settlement, and CLOB venue order reconciliation.
- Keep Hyperliquid-specific `clientOrderId` formatting.
- Normalize credentials as an execution account with `walletAddress` and private key, but do not route Hyperliquid through AMM DEX services.
- Confirm maker/taker fee currency mapping and fill normalization.
- Reconciliation must use Hyperliquid open orders, fills, `clientOrderId`, and `exchangeOrderId` just like other CLOB venues.

### D3. AMM swap is not a fill-less fire-and-forget tx

`EXECUTE_AMM_SWAP` must become a ledger-settled, user-attributed on-chain execution:

1. Risk check.
2. Reserve `tokenIn` plus the gas asset before tx submission.
3. Submit tx through an EVM execution account.
4. Persist an on-chain execution record before or atomically with marking intent `SENT`.
5. Wait for required confirmations outside the tick path.
6. Decode receipt/logs to compute actual token spent, token received, gas paid, and revert/failure status.
7. Append typed ledger entries and update order balance read models for the affected `ledgerOrderId + asset` scopes.
8. Release unused reservation or append failure compensation.
9. Feed reconciliation evidence.

### D4. LP position lifecycle is a trading lifecycle

LP positions are not just strategy parameters. They are external, user-attributed positions with funds locked outside Mr.Market's internal available balance and settled against a specific ledger scope.

Add first-class LP intents:

- `ADD_LIQUIDITY`
- `REMOVE_LIQUIDITY`
- `COLLECT_FEES`

Add a ledger order scope-attributed LP position record:

```ts
type OrderLpPosition = {
  id: string;
  userOrderId: string;
  ledgerOrderId: string;
  accountLabel: string;
  venueId: string;
  chainId: number;
  evmAccountId: string;
  positionTokenId: string;
  poolAddress: string;
  token0: string;
  token1: string;
  feeTier: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  status:
    | 'opening'
    | 'active'
    | 'out_of_range'
    | 'closing'
    | 'closed'
    | 'failed'
    | 'manual_review';
  openedByIntentId: string;
  closedByIntentId?: string;
  lastConfirmedBlock?: number;
};
```

Strategy session parameters may cache a lightweight `lpPositionState` for decisions, but the durable position record and ledger remain authoritative.

### D5. Ledger semantics must cover on-chain execution

Add or map typed ledger facts for on-chain paths. Do not use generic balance adjustments.

AMM swap ledger semantics:

| Event | Ledger effect |
| --- | --- |
| Pre-submit swap reservation | `reserve_lock` for `tokenIn` and gas asset |
| Confirmed successful swap | `swap_settle` debit for actual `tokenIn`, `swap_settle` credit for actual `tokenOut`, `fee_debit` with subtype `gas` |
| Failed/reverted tx | release token reservation; debit actual gas if spent |
| Slippage or amount mismatch | block risk-increasing operations and move to reconciliation/manual review |

LP ledger semantics:

| Event | Ledger effect |
| --- | --- |
| Pre-submit add liquidity | `reserve_lock` for desired `token0`, `token1`, and gas asset |
| Confirmed add liquidity | `lp_add_settle` moves actual used token amounts into position exposure; release unused token amounts; debit gas |
| Confirmed remove liquidity | `lp_remove_settle` credits returned `token0` and `token1`; debit gas |
| Confirmed fee collection | `lp_fee_credit` credits collected `token0` and/or `token1`; debit gas |
| Position mismatch or unknown receipt | pause order and block new risk-increasing intents |

If the OrderBalance read model cannot represent funds in an LP position, extend it with a position/external-locked bucket keyed by `ledgerOrderId + asset`. The ledger remains the source of truth either way.

### D6. On-chain transaction state is durable

Create an on-chain execution record owned by the trading layer:

```ts
type OnchainExecution = {
  id: string;
  userOrderId: string;
  ledgerOrderId: string;
  accountLabel: string;
  intentId: string;
  clientOrderId?: string;
  exchangeOrderId?: string;
  venueId: string;
  chainId: number;
  evmAccountId: string;
  nonce?: number;
  txHash?: string;
  status:
    | 'created'
    | 'submitted'
    | 'confirmed'
    | 'failed'
    | 'reverted'
    | 'replaced'
    | 'manual_review';
  submittedAt?: string;
  confirmedAt?: string;
  blockNumber?: number;
  confirmationCount?: number;
  receiptContentHash?: string;
};
```

Balance-impacting idempotency keys must include `ledgerOrderId`, the affected asset, and the business event identity. Venue/on-chain receipt and event idempotency keys must include `clientOrderId` or `exchangeOrderId` where available, plus `intentId`, `chainId`, `txHash`, and log identity where applicable, while storing `userOrderId`, `ledgerOrderId`, and `accountLabel` on every row. Receipt replays with different content must be rejected and audited.

### D7. EVM keys are split by purpose

Do not reuse one `WEB3_PRIVATE_KEY` for funding, routing, campaign signing, DEX execution, and deployment.

Target account model:

```ts
type ExecutionAccountType = 'exchange_api_key' | 'evm_wallet';
type ExecutionAccountPurpose =
  | 'clob_trading'
  | 'dex_execution'
  | 'funding_operator'
  | 'campaign_signer'
  | 'deployer';
```

DEX execution must use `evm_wallet` accounts with purpose `dex_execution`. Provider-only reads should not require a private key.

### D8. Reconciliation is venue-specific but invariant-driven

Reconciliation adapters differ by venue, but all must answer the same questions:

- Does every risk-increasing intent have a reservation?
- Does every venue mutation have one owning `userOrderId`, `ledgerOrderId`, and `accountLabel`?
- Does every confirmed venue effect have ledger settlement?
- Do local tracked orders, on-chain positions, receipts, and ledger agree?
- If not, which `userOrderId`, `accountLabel`, and asset path must be paused?

## Target Lifecycle

### Hyperliquid / CLOB exchange lifecycle

```text
Controller
  -> CREATE_LIMIT_ORDER / CANCEL_ORDER intent
  -> intent worker risk check
  -> ledger order scope reserve_lock by ledgerOrderId + asset
  -> Hyperliquid adapter submit/cancel
  -> tracked order update with userOrderId + ledgerOrderId + accountLabel + clientOrderId + exchangeOrderId
  -> user stream / REST fill recovery
  -> fill_settle + fee_debit by ledgerOrderId + asset
  -> CLOB venue order reconciliation
```

No AMM DEX logic should run in this path.

### AMM swap lifecycle

```text
Controller
  -> EXECUTE_AMM_SWAP intent
  -> intent worker risk check
  -> reserve tokenIn + gas asset by ledgerOrderId + asset
  -> quote and slippage check
  -> submit tx
  -> persist OnchainExecution with userOrderId + ledgerOrderId + accountLabel + clientOrderId/exchangeOrderId
  -> receipt confirmer
  -> decode actual tokenIn/tokenOut/gas
  -> swap_settle + fee_debit(gas) + reserve_release by ledgerOrderId + asset
  -> on-chain reconciliation
```

### CLMM LP lifecycle

```text
Controller
  -> ADD_LIQUIDITY when no active position
  -> monitor cached pool/position state
  -> REMOVE_LIQUIDITY + ADD_LIQUIDITY when out of range
  -> COLLECT_FEES when fee threshold is met
  -> STOP_CONTROLLER drains position before withdrawal

Intent worker
  -> reservation by ledgerOrderId + asset
  -> on-chain tx submission
  -> receipt confirmation
  -> LP position record update with userOrderId + ledgerOrderId + accountLabel
  -> ledger settlement by ledgerOrderId + asset
  -> reconciliation evidence
```

## Implementation Phases

### Phase 0: Design alignment and gates

- Keep `clob_dex` disabled.
- Document current implemented support:
  - Hyperliquid partial `clob_exchange`;
  - Uniswap/Pancake partial `amm_dex` swap.
- Add strategy/venue capability validation so unsupported combinations fail before runtime.
- Add order-identity validation so new venue/on-chain contracts expose `userOrderId`, `ledgerOrderId`, and `accountLabel`, not an ambiguous naked `orderId`.
- Add tests that Hyperliquid does not resolve to AMM DEX and Uniswap/Pancake do not resolve to CLOB exchange.

### Phase 1: Venue capability model

- Add venue capability types and registry.
- Bind `strategySnapshot.resolvedConfig` to a resolved `venueSnapshot`, `executionAccountSnapshot`, and ledger order scope identity.
- Add validation to strategy config resolution:
  - PMM and dual-account volume require `clob_exchange`;
  - AMM volume requires `amm_dex`;
  - LP strategy requires `clmm_dex`;
  - `clob_dex` remains rejected.
- Update admin strategy templates to expose only valid venue choices.

### Phase 2: Hyperliquid hardening

- Keep Hyperliquid under exchange API-key/execution-account routing.
- Verify order placement, cancellation, fill routing, fees, and reconciliation against Hyperliquid semantics.
- Add focused tests for:
  - wallet address/private key client options;
  - 128-bit submitted `clientOrderId`;
  - fill fee mapping;
  - restart recovery by `clientOrderId` and `exchangeOrderId`;
  - reconciliation blocking on mismatch.
- Do not add funding/custody/product-loop work in this phase.

### Phase 3: EVM execution accounts

- Introduce or migrate to an `ExecutionAccount` model with:
  - `exchange_api_key` for CLOB venues;
  - `evm_wallet` for DEX execution;
  - explicit key purpose;
  - supported chain ids;
  - encrypted secret storage;
  - validation status.
- Add signer resolution by `(accountId, chainId)`.
- Split DEX execution key from funding/campaign/deployer keys.
- Never return private keys through APIs.

### Phase 4: On-chain execution state and confirmer

- Add `OnchainExecution` persistence with `userOrderId`, `ledgerOrderId`, `accountLabel`, `clientOrderId`, and `exchangeOrderId`.
- Add an async receipt confirmer outside tick.
- Add required-confirmation config per chain.
- Decode receipt logs for swaps, LP mint/decrease/collect, and gas usage.
- Handle reverted, failed, replaced, and unknown transactions explicitly.
- On ambiguous submission, reconcile by nonce/tx hash before releasing reservations.

### Phase 5: AMM swap settlement

- Upgrade `EXECUTE_AMM_SWAP` from fire-and-forget to full `ledgerOrderId`-settled, `userOrderId`-attributed execution.
- Reserve token input and gas asset by `ledgerOrderId + asset` before submit.
- Ledger-settle actual token in/out and gas by `ledgerOrderId + asset` after confirmation.
- Release unused reservation if the execution path supports partial use.
- Add reconciliation for receipt, token balance deltas, and ledger settlement.
- Keep controllers free of chain I/O.

### Phase 6: CLMM LP lifecycle

- Add LP intent types:
  - `ADD_LIQUIDITY`;
  - `REMOVE_LIQUIDITY`;
  - `COLLECT_FEES`.
- Add LP adapter methods to Uniswap V3 and PancakeSwap V3 adapters:
  - mint/increase liquidity;
  - decrease liquidity;
  - collect;
  - read position;
  - read pool state.
- Add `OrderLpPosition` persistence with `userOrderId`, `ledgerOrderId`, and `accountLabel`.
- Add LP controller for:
  - open;
  - monitor;
  - rebalance;
  - collect fees;
  - close on stop.
- Add LP ledger semantics for position exposure, fee credits, returned funds, gas, and reversals by `ledgerOrderId + asset`.

### Phase 7: Funding and withdrawal integration

For admin-direct MVP:

- Admin-direct orders may use pre-provisioned execution accounts, but order balances still need explicit typed credits into the correct `ledgerOrderId + asset` scope before reservation.
- Do not rely only on external wallet balances as the balance source of truth.

For user-facing DEX execution:

- Replace `withdraw_to_exchange` with `stage_to_evm_execution_wallet`.
- Debit or lock the `ledgerOrderId + asset` balance before external transfer.
- Confirm the transfer on-chain before starting runtime.
- On stop, close LP positions, settle receipts, release reservations, then allow withdrawal/refund.
- Withdrawal remains after strategy stop, external positions close, and reservations release.

### Phase 8: Admin and Web3 UI

- Admin direct create form:
  - venue family selector;
  - Hyperliquid shown under exchange/CLOB venues;
  - Uniswap/Pancake shown under AMM/CLMM venues;
  - EVM account picker only for DEX execution.
- Strategy templates filter by venue capabilities.
- Runtime status views show:
  - CLOB tracked orders;
  - on-chain tx state;
  - LP position state;
  - gas and fee ledger facts;
  - reconciliation blocks.

### Phase 9: Reconciliation and operational safety

- Add per-venue reconciliation runners:
  - CLOB venue order/fill reconciliation;
  - Hyperliquid-specific open order/fill recovery if CCXT behavior differs;
  - on-chain receipt/event reconciliation;
  - LP position ownership/liquidity/fee reconciliation.
- Any mismatch pauses new risk-increasing intents for the affected order/account/asset.
- Add manual-review records rather than applying generic balance corrections.

## Testing Requirements

Unit tests:

- Ledger order scope propagation for CLOB, Hyperliquid, AMM swap, and CLMM LP paths.
- Venue capability resolution.
- Strategy config validation by venue family.
- Hyperliquid credential/options/`clientOrderId` handling.
- AMM reservation and settlement ledger commands.
- LP intent controller decisions.
- On-chain receipt decoding and idempotency.

Integration tests:

- CEX PMM regression.
- Hyperliquid CLOB lifecycle with mocked adapter, verifying tracked order and fill settlement carry `userOrderId`, `ledgerOrderId`, and `accountLabel`.
- AMM swap lifecycle from intent to ledger settlement with mocked receipt, verifying token and gas effects settle by `ledgerOrderId + asset`.
- LP open -> monitor -> rebalance -> collect -> close with mocked position manager, verifying position and ledger rows carry `userOrderId`, `ledgerOrderId`, and `accountLabel`.
- Reconciliation blocks risk-increasing operations on mismatch.

Manual/testnet tests:

- PancakeSwap V3 on BSC testnet or fork.
- Uniswap V3 on a forked EVM chain.
- Hyperliquid sandbox or smallest safe live validation if no sandbox exists.

## Out of Scope

- Generic DEX aggregator routing.
- Cross-chain bridging.
- MEV protection beyond slippage and deadline controls.
- On-chain CLOB (`clob_dex`) execution.
- User-facing Hyperliquid funding/custody flow.

## Acceptance Criteria

The updated design is complete when:

1. Hyperliquid is formally modeled as `clob_exchange`, not AMM DEX.
2. Uniswap/PancakeSwap swap execution is `userOrderId`-attributed, `ledgerOrderId`-settled, and receipt-confirmed.
3. LP positions have a durable `userOrderId` / `ledgerOrderId` attributed lifecycle:
   open -> monitor -> rebalance -> collect fees -> close.
4. Gas, slippage, LP fees, failed txs, and reversals are represented with typed ledger/reconciliation paths.
5. Controllers remain side-effect-free and tick remains non-blocking.
6. Reconciliation can block risk-increasing operations for CLOB, AMM swap, and CLMM LP mismatches.
7. Funding and withdrawal lifecycle is defined for DEX execution accounts before user-facing launch.
8. New venue/on-chain service contracts and persistence records carry `userOrderId`, `ledgerOrderId`, and `accountLabel`; balance mutation paths are keyed by `ledgerOrderId + asset`.
