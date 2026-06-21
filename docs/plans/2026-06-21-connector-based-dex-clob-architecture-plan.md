# Connector-Based DEX and CLOB Architecture Plan

Status: active design plan

Source of truth:

- `docs/product/yellowpaper.md`
- `docs/architecture/market-making-flow.md`
- `docs/archive/plans/2026-06-11-ledger-order-id-user-order-id-plan.md`
- `docs/archive/plans/2026-04-19-dex-strategy-architecture-plan.md` as historical input only

## Goal

Extend Mr.Market from CEX-first execution into a connector-neutral trading layer while preserving yellowpaper invariants:

- Ledger remains the balance source of truth.
- All balances remain scoped by `ledgerOrderId + asset`.
- `userOrderId` remains the user-facing aggregation key for order detail, PnL, rewards, withdrawals, and reports.
- Risk check and ledger order scope reservation happen before any risk-increasing connector mutation.
- Controllers only produce actions or intents.
- Intent workers own reservation, connector mutation, tracking, settlement, and state transitions.
- Tick never waits on exchange I/O, chain I/O, REST fallback, or DB settlement.
- Fills, fees, gas, LP movements, withdrawals, rewards, and reversals remain attributable to one `userOrderId`; balance effects settle against one `ledgerOrderId + asset` scope.
- Reconciliation blocks risk-increasing operations on mismatch.

This plan supersedes the archived DEX LP plan and the 2026-06-13 venue plan as the active design direction. The 2026-06-13 plan predates the connector naming conventions and the finalized decisions on intent model, connector interface, and LP management approach documented here.

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

The updated yellowpaper defines the order identity vocabulary below. This plan must use the same terms in all new connector and on-chain contracts:

| Name | Meaning | Primary use in this plan |
| --- | --- | --- |
| `userOrderId` | Product and user-facing order identity. | Order detail, UI/API reads, PnL, rewards, withdrawals, reporting, and every connector/on-chain attribution record. |
| `ledgerOrderId` | Balance bucket identity. | Ledger Entry, OrderBalance, reservation, fill settlement, fee settlement, swap settlement, LP settlement, gas debit, withdrawals, and reconciliation balance checks are keyed by `ledgerOrderId + asset`. |
| `accountLabel` | Execution account or strategy leg under a `userOrderId`, for example `default`, `maker`, or `taker`. It is not an order id by itself. | Connector routing, EVM execution routing, dual-account scope resolution, tracked orders, on-chain executions, LP positions, and reconciliation reports. |
| `clientOrderId` | Client-supplied connector order id generated before order placement. | Placement idempotency and fill routing; submitted exchange-safe forms are mapped back through `ExchangeOrderMapping`. |
| `exchangeOrderId` | Connector-side order id returned by the exchange or on-chain execution connector. | Fetch, cancel, open-order reconciliation, fill matching, on-chain receipt/position matching. It must never be used as a balance scope. |

Rules:

- New service contracts must not pass a naked `orderId` when both identities are possible.
- Single-account CEX, Hyperliquid, AMM swap, and CLMM LP orders normally use `userOrderId === ledgerOrderId` with `accountLabel = 'default'`.
- Dual-account CLOB strategies share one `userOrderId` and use separate `ledgerOrderId` scopes such as maker and taker.
- If a future DEX strategy uses multiple EVM execution accounts under one user order, it must create explicit ledger scopes through the centralized ledger-order-scope helper instead of parsing suffixes locally.
- `clientOrderId` is for connector placement idempotency and routing only.
- `exchangeOrderId` is connector evidence only; it must never become a ledger balance key.
- Reconciliation reports must include `userOrderId`, `ledgerOrderId`, and `accountLabel`; balance checks stay keyed by `ledgerOrderId + asset`.

## Summary of Design Decisions

| Decision | Choice |
|---|---|
| Raydium/Solana | Deferred, design extensibility for later |
| LP lifecycle | Included in architecture design |
| Implementation priority | Design full architecture, implement connector by connector |
| Funding flow | Admin-direct only for now |
| Trading destination naming | **Connector** (connectorId, e.g., "binance", "uniswapV3") |
| Grouping naming | **ExchangeType** (clob, amm, clmm, clob_dex [future]) |
| Connector interface | High-level action-based: submitAction/cancelAction/queryState |
| Adapter interface | Split now: EvmDexAdapter, documented SolanaDexAdapter path |
| On-chain confirmation | Decouple tx submission from receipt confirmation, durable OnchainExecution records |
| Confirmation service | Shared OnchainExecutionService, per-chain strategies internally |
| Execution account purposes | Two: clob_trading, dex_execution |
| Execution account storage | Keep ExchangeApiKey for CEX, add TradingAccount for EVM wallets, plan CEX migration to TradingAccount as a TODO |
| Intent model | Per-connector-family intent types (CLOB, AMM, CLMM as separate type groups) |
| Controller model | Multiple new controllers: ammVolume, liquidityProvision |
| Reconciliation | Separate runners: CLOB, on-chain, LP position |
| Connector runtime | Separate types: ExchangeConnectorRuntime (CLOB), OnchainConnectorRuntime (on-chain) |
| Multi-chain | BSC + Ethereum + Polygon |
| Gas handling | Full: EIP-1559 + gas price oracle + gas limit optimization + pre-execution gas cost reservation in ledger |
| MEV protection | Basic only: slippage tolerance + deadline |
| LP management | Hybrid: pool state poller outside tick -> cached state -> tick-driven LP controller -> emits intents |

## Naming Conventions

### Replaces "venue" from the previous plan document

| Concept | Term | Examples |
|---|---|---|
| Trading destination | **Connector** (connectorId) | "binance", "mexc", "hyperliquid", "uniswapV3", "pancakeV3" |
| Connector grouping | **ExchangeType** | clob, amm, clmm, clob_dex |
| Credential entity (non-CEX) | **TradingAccount** (trading_accounts) | EVM wallet with purpose dex_execution |
| On-chain tx lifecycle | **OnchainExecution** (onchain_executions) | tx submission, confirmation, settlement |
| LP position record | **OrderLpPosition** (order_lp_positions) | NFT position with tick range, liquidity, fees |

### Renaming existing modules

| Current | New | Reason |
|---|---|---|
| `server/src/modules/defi/` | `server/src/modules/market-making/connector/adapters/` | Move DEX adapters under connector layer |
| `defi/adapter-registry.ts` | `connector/adapters/evm-dex-adapter-registry.ts` | EVM-specific adapter registry |
| `defi/adapters/dex-adapter.ts` | `connector/adapters/evm-dex-adapter.ts` | EVM-specific interface, extensible for Solana |
| `defi/adapters/uniswapV3.adapter.ts` | `connector/adapters/uniswap-v3.adapter.ts` | Consistent naming |
| `defi/adapters/pancakeV3.adapter.ts` | `connector/adapters/pancake-v3.adapter.ts` | Consistent naming |
| `defi/abis.ts` | `connector/adapters/abis.ts` | Move with adapters |
| `defi/utils/` | `connector/adapters/utils/` | Move with adapters |
| `common/constants/defi-addresses.ts` | `common/constants/connector-addresses.ts` | Connector-neutral naming |
| `DexId` type | `ConnectorId` type | Unified with CLOB connector IDs |
| `strategy/dex/dex.module.ts` | Removed, distributed into connector and strategy modules | No longer a separate module |
| `strategy/dex/dex-volume.strategy.service.ts` | Logic moves into `OnchainDexConnector.submitAction()` + `AmmVolumeStrategyController` | Execution in connector, decisions in controller |
| `strategy/dex/strategy-config-resolver.service.ts` | Stays in `strategy/config/` (already there conceptually) | Config resolution is cross-connector |
| `strategy-execution-category.ts` `clob_cex` | `clob` | Simplified, matches ExchangeType |
| `strategy-execution-category.ts` `amm_dex` | `amm` | Simplified, matches ExchangeType |

### TODO: CEX credential migration

- Keep `ExchangeApiKey` / `exchange_api_keys` for CEX credentials now
- Create `TradingAccount` / `trading_accounts` for EVM wallet credentials
- TODO: Migrate CEX credentials from `exchange_api_keys` to `trading_accounts` in a future phase (add type `exchange_api_key` to TradingAccount, migrate data, deprecate old table)

## Connector Taxonomy

Do not put Hyperliquid, Uniswap, and PancakeSwap under one "DEX" abstraction. They have different settlement and lifecycle semantics.

| ExchangeType | Examples | Liquidity model | Settlement domain | Target path |
| --- | --- | --- | --- | --- |
| `clob` | Binance, MEXC, Hyperliquid spot/perps if adapter-backed | Orders and fills | Exchange account | Existing CLOB intent path |
| `amm` | Uniswap V3 swap, PancakeSwap V3 swap | Atomic pool swap | EVM chain | On-chain swap intent path |
| `clmm` | Uniswap V3 LP, PancakeSwap V3 LP | Concentrated liquidity NFT/position | EVM chain | LP position lifecycle path |
| `clob_dex` | Future on-chain CLOB | Orders and fills on-chain | Chain or hybrid | Out of scope until designed |

Hyperliquid belongs in `clob` for this phase. It should share the same trading-layer invariants as Binance/MEXC, with connector-specific credential signing, `clientOrderId`, fee, and reconciliation handling.

Uniswap/PancakeSwap belong in `amm` for swaps and `clmm` for LP positions. They require on-chain transaction and receipt handling, not CLOB order ACK/fill assumptions.

## Architecture Overview

The architecture follows the yellowpaper's three-layer model, extended with a connector abstraction layer in the trading layer.

```text
Funding Layer
  Mixin deposits -> OrderBalance (ledgerOrderId + asset)
  Admin-direct: pre-provisioned TradingAccount, typed credits into ledgerOrderId + asset
                    |
Scheduling Layer
  Tick -> Strategy Controllers -> Actions/Intents -> Intent Store -> Intent Worker
                    |
Trading Layer
  Intent Worker -> Connector Registry -> Connector.submitAction(intent)
    CLOB:           ClobConnector       -> Exchange API -> Tracked Orders -> Fill Settlement -> CLOB Reconciliation
    AMM:            OnchainDexConnector -> EVM Tx Submit -> OnchainExecution -> Receipt Confirm -> Swap Settle -> Onchain Reconciliation
    CLMM:           OnchainDexConnector -> EVM Tx Submit -> OnchainExecution -> Receipt Confirm -> LP Position Update + LP Settle -> LP Reconciliation

Horizontal: Ledger (source of truth) | Reservation | Reconciliation | Risk | Audit
```

## Key Interfaces and Types

### ExchangeType and ConnectorCapability

```typescript
type ExchangeType = 'clob' | 'amm' | 'clmm' | 'clob_dex';

type SettlementDomain = 'exchange_account' | 'evm_chain';

type ConnectorCapability = {
  connectorId: string;            // "binance", "uniswapV3", etc.
  exchangeType: ExchangeType;
  settlementDomain: SettlementDomain;
  supportedIntentTypes: string[];
  supportsOpenOrders: boolean;      // CLOB: true, AMM/CLMM: false
  supportsAtomicSwap: boolean;      // AMM: true, others: false
  supportsLpPositions: boolean;     // CLMM: true, others: false
  requiresOnchainConfirmations: boolean;  // on-chain: true, CLOB: false
  supportedChainIds?: number[];     // on-chain connectors only
};
```

### Connector Interface (high-level action-based)

```typescript
interface Connector {
  readonly connectorId: string;
  readonly exchangeType: ExchangeType;
  readonly capabilities: ConnectorCapability;

  submitAction(intent: StrategyOrderIntent): Promise<ConnectorActionResult>;
  cancelAction(intent: StrategyOrderIntent): Promise<ConnectorActionResult>;
  queryState(intent: StrategyOrderIntent): Promise<ConnectorState>;
}

type ConnectorActionResult = {
  status: 'submitted' | 'confirmed' | 'failed';
  exchangeOrderId?: string;    // CLOB: exchange order id
  txHash?: string;             // on-chain: transaction hash
  onchainExecutionId?: string; // on-chain: OnchainExecution record id
  details?: Record<string, unknown>;
};
```

The intent execution service calls `connector.submitAction(intent)` regardless of connector family. The connector implementation internally dispatches based on intent type.

### ClobConnector (implements Connector)

Wraps the existing `ExchangeConnectorAdapterService`:
- `submitAction` for `CREATE_LIMIT_ORDER` -> placeLimitOrder
- `cancelAction` for `CANCEL_ORDER` -> cancelOrder
- `queryState` -> fetchOrder / fetchOpenOrders

### OnchainDexConnector (implements Connector)

Wraps `EvmDexAdapter` implementations:
- `submitAction` for `EXECUTE_AMM_SWAP` -> adapter.exactInputSingle (submit tx, return txHash)
- `submitAction` for `ADD_LIQUIDITY` -> adapter.mint / increaseLiquidity
- `submitAction` for `REMOVE_LIQUIDITY` -> adapter.decreaseLiquidity
- `submitAction` for `COLLECT_FEES` -> adapter.collect
- `cancelAction` -> not supported (on-chain txs cannot be cancelled after submission)
- `queryState` -> adapter.readPosition / readPoolState

### EvmDexAdapter (chain-family-specific, lower level)

```typescript
interface EvmDexAdapter {
  readonly connectorId: string;
  supportsChain(chainId: number): boolean;
  getAddresses(chainId: number): { factory; router; quoterV2; weth };

  // AMM swap operations
  getPool(provider, chainId, tokenIn, tokenOut, fee): Promise<string>;
  quoteExactInputSingle(provider, chainId, params): Promise<{ amountOut }>;
  estimateGasExactInputSingle(signer, chainId, params): Promise<BigNumber>;
  exactInputSingle(signer, chainId, params): Promise<TxReceipt>;

  // CLMM LP operations (new)
  mint(signer, chainId, params): Promise<TxReceipt>;
  increaseLiquidity(signer, chainId, params): Promise<TxReceipt>;
  decreaseLiquidity(signer, chainId, params): Promise<TxReceipt>;
  collect(signer, chainId, params): Promise<TxReceipt>;
  readPosition(provider, chainId, tokenId): Promise<PositionState>;
  readPoolState(provider, chainId, poolAddress): Promise<PoolState>;
}

// Documented extension path for future SolanaDexAdapter:
// interface SolanaDexAdapter {
//   readonly connectorId: string;
//   supportsChain(chainId: number): boolean; // Solana chain IDs
//   quoteExactInputSingle(connection, params): Promise<{ amountOut }>;
//   exactInputSingle(payer, params): Promise<TxSignature>;
//   // ... LP operations
// }
```

### Intent Types (per-connector-family)

```typescript
type ClobIntentType = 'CREATE_LIMIT_ORDER' | 'CANCEL_ORDER' | 'REPLACE_ORDER';
type AmmIntentType = 'EXECUTE_AMM_SWAP';
type ClmmIntentType = 'ADD_LIQUIDITY' | 'REMOVE_LIQUIDITY' | 'COLLECT_FEES';
type SystemIntentType = 'STOP_CONTROLLER' | 'STOP_EXECUTOR';
type StrategyIntentType = ClobIntentType | AmmIntentType | ClmmIntentType | SystemIntentType;
```

The `StrategyOrderIntent` type gains a `connectorId` field. The execution service dispatches to the connector, and the connector dispatches by intent type internally.

### StrategyType (extended)

```typescript
type StrategyType =
  | 'arbitrage'
  | 'pureMarketMaking'
  | 'efficientDualAccountVolume'
  | 'volume'              // existing CEX volume
  | 'timeIndicator'
  | 'ammVolume'           // new: AMM DEX volume
  | 'liquidityProvision'; // new: CLMM LP lifecycle
```

## New Data Models

### TradingAccount Entity

```typescript
@Entity('trading_accounts')
class TradingAccount {
  id: string;
  label: string;                    // user-friendly name
  type: 'evm_wallet';               // future: 'exchange_api_key'
  purpose: 'clob_trading' | 'dex_execution';
  chainIds: number[];               // supported chains
  walletAddress: string;            // EVM wallet address
  encryptedPrivateKey: string;      // encrypted with admin.encryption_private_key
  validationStatus: 'pending' | 'valid' | 'invalid';
  createdAt: string;
  updatedAt: string;
}
```

`TradingAccountService`:
- `getSigner(accountId, chainId)` -> resolves ethers.Wallet from encrypted private key + chain RPC
- `getSignerForPurpose(purpose, chainId)` -> resolves a signer for a purpose on a chain
- CRUD for admin management
- Never returns private keys through APIs

### OnchainExecution Entity

```typescript
@Entity('onchain_executions')
class OnchainExecution {
  id: string;
  userOrderId: string;
  ledgerOrderId: string;
  accountLabel: string;
  intentId: string;
  connectorId: string;
  exchangeType: ExchangeType;
  chainId: number;
  tradingAccountId: string;
  nonce?: number;
  txHash?: string;
  status: 'created' | 'submitted' | 'confirmed' | 'failed' | 'reverted' | 'replaced' | 'manual_review';
  submittedAt?: string;
  confirmedAt?: string;
  blockNumber?: number;
  confirmationCount?: number;
  requiredConfirmations: number;
  receiptContentHash?: string;
  decodedEvents?: Record<string, unknown>;  // decoded swap/LP events
  gasUsed?: string;
  gasPrice?: string;
  effectiveGasCost?: string;
  createdAt: string;
  updatedAt: string;
}
```

### OrderLpPosition Entity

```typescript
@Entity('order_lp_positions')
class OrderLpPosition {
  id: string;
  userOrderId: string;
  ledgerOrderId: string;
  accountLabel: string;
  connectorId: string;            // "uniswapV3" or "pancakeV3"
  chainId: number;
  tradingAccountId: string;
  positionTokenId: string;        // NFT token id
  poolAddress: string;
  token0: string;
  token1: string;
  feeTier: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  status: 'opening' | 'active' | 'out_of_range' | 'closing' | 'closed' | 'failed' | 'manual_review';
  openedByIntentId: string;
  closedByIntentId?: string;
  lastConfirmedBlock?: number;
  uncollectedFees0?: string;
  uncollectedFees1?: string;
  createdAt: string;
  updatedAt: string;
}
```

## New Ledger Entry Types

Extended from the existing ledger types:

| Ledger type | Meaning | Scope |
|---|---|---|
| `deposit_credit` | User deposit (existing) | ledgerOrderId + asset |
| `reserve_lock` | Balance locked before action (existing) | ledgerOrderId + asset |
| `reserve_release` | Locked balance released (existing) | ledgerOrderId + asset |
| `fill_settle` | CLOB fill settlement (existing) | ledgerOrderId + asset |
| `fee_debit` | Fee deduction (existing, extended with subtype `gas`) | ledgerOrderId + asset |
| `withdraw_debit` | Withdrawal deduction (existing) | ledgerOrderId + asset |
| `reward_credit` | Reward credit (existing) | ledgerOrderId + asset |
| `reversal` | Reversal entry (existing) | ledgerOrderId + asset |
| **`swap_settle`** | AMM swap: debit tokenIn, credit tokenOut | ledgerOrderId + asset (per asset) |
| **`lp_add_settle`** | LP add: move tokens into position exposure | ledgerOrderId + asset |
| **`lp_remove_settle`** | LP remove: credit returned tokens | ledgerOrderId + asset |
| **`lp_fee_credit`** | LP fee collection: credit collected fees | ledgerOrderId + asset |
| **`gas_debit`** | Gas cost deduction (typed, not generic) | ledgerOrderId + gas_asset |

The `OrderBalance` read model is extended with an `external_locked` bucket for funds in LP positions, keyed by `ledgerOrderId + asset`.

## Module Structure

### New and restructured modules

```text
server/src/modules/market-making/
├── connector/                          # Connector abstraction layer
│   ├── connector.types.ts              # Connector interface, ConnectorCapability, ExchangeType
│   ├── connector-registry.ts           # ConnectorRegistry - resolves connectorId -> Connector
│   ├── clob-connector.ts               # ClobConnector implements Connector
│   ├── onchain-dex-connector.ts        # OnchainDexConnector implements Connector
│   ├── exchange-connector.ts           # ExchangeConnectorRuntime (existing, CLOB runtime services)
│   ├── exchange-connector-registry.ts  # ExchangeConnectorRegistry (existing)
│   ├── onchain-connector.ts            # OnchainConnectorRuntime (new, on-chain runtime services)
│   ├── onchain-connector-registry.ts   # OnchainConnectorRegistry (new)
│   ├── connector.module.ts             # Wires all connector components
│   └── adapters/                       # EVM DEX adapters (moved from defi/)
│       ├── evm-dex-adapter.ts          # EvmDexAdapter interface
│       ├── evm-dex-adapter-registry.ts # EvmDexAdapterRegistry
│       ├── uniswap-v3.adapter.ts       # UniswapV3Adapter (extended with LP methods)
│       ├── pancake-v3.adapter.ts       # PancakeV3Adapter (extended with LP methods)
│       ├── abis.ts                     # Contract ABIs (extended with LP ABI)
│       └── utils/                      # ERC20 helpers, etc.
│
├── trading-account/                    # TradingAccount entity (new)
│   ├── trading-account.entity.ts
│   ├── trading-account.service.ts      # CRUD, signer resolution by (accountId, chainId)
│   └── trading-account.module.ts
│
├── onchain-execution/                  # On-chain tx lifecycle (new)
│   ├── onchain-execution.entity.ts     # OnchainExecution record
│   ├── onchain-execution.service.ts    # Create/update/query OnchainExecution records
│   ├── onchain-receipt-confirmer.service.ts  # Async confirmer, per-chain confirmation strategies
│   ├── gas-price-oracle.service.ts     # EIP-1559 gas price estimation per chain
│   └── onchain-execution.module.ts
│
├── lp-position/                        # LP position management (new)
│   ├── order-lp-position.entity.ts     # OrderLpPosition record
│   ├── lp-position-tracker.service.ts  # Position state cache and updates
│   ├── pool-state-tracker.service.ts   # Pool state poller (outside tick, like orderbook tracker)
│   ├── lp-position.module.ts
│   └── lp-position-reconciliation.service.ts
│
├── strategy/
│   ├── controllers/
│   │   ├── arbitrage-strategy.controller.ts               # existing
│   │   ├── pure-market-making-strategy.controller.ts       # existing
│   │   ├── efficient-dual-account-volume-strategy.controller.ts  # existing
│   │   ├── volume-strategy.controller.ts                   # existing (CEX volume only)
│   │   ├── time-indicator-strategy.controller.ts           # existing
│   │   ├── amm-volume-strategy.controller.ts               # NEW: AMM DEX volume
│   │   └── liquidity-provision-strategy.controller.ts      # NEW: CLMM LP lifecycle
│   ├── config/
│   │   ├── strategy-controller.types.ts    # extended with ammVolume, liquidityProvision
│   │   ├── strategy-intent.types.ts        # extended with CLMM intent types, connectorId field
│   │   ├── strategy-execution-category.ts  # renamed values: clob, amm, clmm
│   │   ├── connector-types.ts              # ExchangeType, ConnectorCapability (or in connector/)
│   │   └── strategy-config-resolver.service.ts  # moved from strategy/dex/
│   ├── execution/
│   │   ├── strategy-intent-execution.service.ts  # refactored: uses ConnectorRegistry.submitAction
│   │   └── ... (existing)
│   └── ... (existing)
│
├── reconciliation/
│   ├── exchange-order-reconciliation-runner.ts       # existing CLOB
│   ├── onchain-execution-reconciliation-runner.ts    # NEW: on-chain receipt vs ledger
│   ├── lp-position-reconciliation-runner.ts          # NEW: LP position vs ledger
│   └── reconciliation.service.ts                     # coordinates all runners
│
├── ledger/                             # existing, extended
│   ├── balance-ledger.service.ts       # new ledger types: swap_settle, lp_add_settle, etc.
│   └── order-reservation.service.ts    # extended: reserve gas asset, reserve for LP
│
└── ... (existing modules: tick, trackers, user-orders, etc.)
```

### Removed modules

- `server/src/modules/defi/` -> moved to `connector/adapters/`
- `server/src/modules/market-making/strategy/dex/` -> distributed into `connector/` and `strategy/`

### Connector runtime services

**ExchangeConnectorRuntime (existing, CLOB)**:

```typescript
type ExchangeConnectorRuntime = {
  exchange: string;
  orderTracker: ExchangeOrderTrackerService;
  reconciliationRunner: ExchangeOrderReconciliationRunner;
  userStreamTracker: UserStreamTrackerService;
  balanceCache: BalanceStateCacheService;
  balanceRefreshScheduler: BalanceRefreshScheduler;
  orderBookTracker: OrderBookTrackerService;
};
```

**OnchainConnectorRuntime (new, on-chain)**:

```typescript
type OnchainConnectorRuntime = {
  connectorId: string;           // "uniswapV3", "pancakeV3"
  chainId: number;
  onchainExecutionTracker: OnchainExecutionService;
  lpPositionTracker: LpPositionTrackerService;
  poolStateTracker: PoolStateTrackerService;
  reconciliationRunner: OnchainExecutionReconciliationRunner;
  lpReconciliationRunner: LpPositionReconciliationRunner;
};
```

## Execution Flows

### CLOB flow (Binance, MEXC, Hyperliquid) - existing, refactored to use Connector

```text
Controller -> CREATE_LIMIT_ORDER intent
  -> intent worker risk check
  -> reserve_lock by ledgerOrderId + asset
  -> ConnectorRegistry.resolve(connectorId).submitAction(intent)
    -> ClobConnector: placeLimitOrder via ExchangeConnectorAdapterService
  -> tracked order update (userOrderId, ledgerOrderId, accountLabel, clientOrderId, exchangeOrderId)
  -> user stream / REST fill recovery
  -> fill_settle + fee_debit by ledgerOrderId + asset
  -> CLOB reconciliation
```

Hyperliquid stays on this path. It is a CLOB connector that uses wallet-based credentials (walletAddress + privateKey as TradingAccount with purpose clob_trading). The 128-bit clientOrderId formatting stays in the ClobConnector.

### AMM swap flow (Uniswap V3, PancakeSwap V3) - new

```text
Controller -> EXECUTE_AMM_SWAP intent
  -> intent worker risk check
  -> reserve_lock for tokenIn + gas asset by ledgerOrderId + asset
  -> gas price oracle: estimate EIP-1559 gas price
  -> gas limit estimation
  -> ConnectorRegistry.resolve(connectorId).submitAction(intent)
    -> OnchainDexConnector: EvmDexAdapter.exactInputSingle (submit tx, return txHash)
  -> persist OnchainExecution record (status: submitted)
  -> intent marked SENT (worker moves on, does NOT wait for confirmation)
  -> OnchainReceiptConfirmer (async, outside tick):
    -> wait for required confirmations per chain
    -> decode receipt logs for actual tokenIn, tokenOut, gas
    -> update OnchainExecution (status: confirmed, decodedEvents, gasUsed)
    -> swap_settle debit tokenIn, swap_settle credit tokenOut by ledgerOrderId + asset
    -> gas_debit by ledgerOrderId + gas_asset
    -> reserve_release for unused reservation
  -> on-chain reconciliation (receipt vs ledger)
```

### CLMM LP flow (Uniswap V3, PancakeSwap V3) - new

```text
LP Controller (tick-driven, reads cached pool/position state):
  -> when no active position: ADD_LIQUIDITY intent
  -> when position out of range: REMOVE_LIQUIDITY + ADD_LIQUIDITY intents
  -> when fee threshold met: COLLECT_FEES intent
  -> when stopping: REMOVE_LIQUIDITY + COLLECT_FEES intents

Intent worker (for each LP intent):
  -> risk check
  -> reserve_lock for token0, token1, gas asset by ledgerOrderId + asset
  -> ConnectorRegistry.resolve(connectorId).submitAction(intent)
    -> OnchainDexConnector: EvmDexAdapter.mint/decreaseLiquidity/collect
  -> persist OnchainExecution record
  -> OnchainReceiptConfirmer:
    -> confirm receipt
    -> decode events
    -> update OrderLpPosition (status, liquidity, fees)
    -> lp_add_settle / lp_remove_settle / lp_fee_credit by ledgerOrderId + asset
    -> gas_debit by ledgerOrderId + gas_asset
  -> LP position reconciliation
```

### Pool state tracking (hybrid, outside tick)

```text
PoolStateTrackerService (runs outside tick, like OrderBookTrackerService):
  -> periodically polls pool state (currentTick, sqrtPriceX96, liquidity, feeGrowth)
  -> caches pool state per (connectorId, chainId, poolAddress)
  -> LP controller reads cached state on tick (no I/O)

LpPositionTrackerService:
  -> reads position state from OnchainExecution confirmations and periodic polls
  -> caches position state per (userOrderId, positionTokenId)
  -> LP controller reads cached state on tick
```

## Gas Handling

### GasPriceOracleService

- Per-chain EIP-1559 fee estimation (maxFeePerGas, maxPriorityFeePerGas)
- Caches gas prices with TTL per chain
- Uses `ethers.provider.getFeeData()` with gas multiplier config
- Supports BSC (legacy gas price), Ethereum (EIP-1559), Polygon (EIP-1559)

### Pre-execution gas cost reservation

Before any on-chain tx submission:

1. Estimate gas limit via `adapter.estimateGas*()` or `provider.estimateGas()`
2. Get gas price from GasPriceOracleService
3. Compute `estimatedGasCost = gasLimit * gasPrice`
4. `reserve_lock` for gas asset (native token) by `ledgerOrderId + gas_asset`
5. After confirmation, `gas_debit` for actual gas cost, `reserve_release` for unused gas reservation

## Reconciliation

Three separate reconciliation runners, coordinated by `ReconciliationService`:

1. **ExchangeOrderReconciliationRunner** (existing, CLOB):
   - Compares tracked orders, fills, fees against exchange state
   - Blocks risk-increasing operations on mismatch

2. **OnchainExecutionReconciliationRunner** (new):
   - Compares OnchainExecution records (confirmed status, decoded events) against ledger entries
   - Detects: confirmed tx without ledger settlement, ledger settlement without confirmed receipt, receipt content hash mismatch
   - Blocks risk-increasing operations for affected ledgerOrderId + asset

3. **LpPositionReconciliationRunner** (new):
   - Compares OrderLpPosition records against on-chain position state (liquidity, fees, tick range)
   - Compares LP position ledger entries against actual position value
   - Detects: position mismatch, missing position record, stale position state
   - Blocks new LP intents for affected orders

All reconciliation runners:
- Emit manual-review records rather than applying generic balance corrections
- Block risk-increasing intents for affected `userOrderId`, `accountLabel`, and asset path
- Include `userOrderId`, `ledgerOrderId`, and `accountLabel` in all reports

## Implementation Phases

### Phase 1: Connector abstraction and naming refactor

- Create `connector/` module with Connector interface, ConnectorCapability, ExchangeType types
- Move `defi/` adapters to `connector/adapters/`, rename to EvmDexAdapter
- Rename `DexId` to `ConnectorId`, `defi-addresses.ts` to `connector-addresses.ts`
- Rename execution categories: `clob_cex` -> `clob`, `amm_dex` -> `amm`
- Create ConnectorRegistry, ClobConnector (wrapping existing ExchangeConnectorAdapterService)
- Refactor StrategyIntentExecutionService to use `connector.submitAction(intent)` for CLOB path
- Add `connectorId` to StrategyOrderIntent
- Update strategy config resolver to validate connector/exchangeType combinations
- Tests: CLOB regression, connector resolution, exchangeType validation

### Phase 2: TradingAccount and EVM signer resolution

- Create TradingAccount entity, migration, service
- Implement `getSigner(accountId, chainId)` with encrypted private key decryption
- Implement `getSignerForPurpose(purpose, chainId)`
- Wire TradingAccountService into OnchainDexConnector
- Keep Web3Service for provider/chain connectivity (RPC URLs, block queries)
- Keep ExchangeApiKey for CEX credentials
- Tests: signer resolution, encryption/decryption, multi-chain support

### Phase 3: OnchainExecution and receipt confirmer

- Create OnchainExecution entity, migration, service
- Implement OnchainReceiptConfirmerService (shared, per-chain confirmation strategies)
- Implement GasPriceOracleService (EIP-1559, per-chain)
- Add confirmation config per chain (required confirmations, poll interval)
- Handle: submitted -> confirmed, failed, reverted, replaced, stuck pending
- Tests: receipt confirmation lifecycle, gas estimation, per-chain strategies

### Phase 4: AMM swap full settlement

- Create OnchainDexConnector implementing Connector for AMM swap
- Refactor EXECUTE_AMM_SWAP: reserve tokenIn + gas, submit tx, persist OnchainExecution, async confirm, swap_settle + gas_debit
- Add `swap_settle` and `gas_debit` ledger types
- Add gas cost reservation to OrderReservationService
- Create AmmVolumeStrategyController (new controller type)
- OnchainExecutionReconciliationRunner for swap receipts
- Tests: full AMM swap lifecycle from intent to ledger settlement with mocked receipt

### Phase 5: CLMM LP lifecycle

- Extend EvmDexAdapter with LP methods (mint, increaseLiquidity, decreaseLiquidity, collect, readPosition, readPoolState)
- Create OrderLpPosition entity, migration, tracker service
- Create PoolStateTrackerService (outside tick, like orderbook tracker)
- Create LiquidityProvisionStrategyController (tick-driven, reads cached pool/position state)
- Add ADD_LIQUIDITY, REMOVE_LIQUIDITY, COLLECT_FEES intent types
- Add `lp_add_settle`, `lp_remove_settle`, `lp_fee_credit` ledger types
- Extend OrderBalance with `external_locked` bucket for LP positions
- LpPositionReconciliationRunner
- Tests: LP open -> monitor -> rebalance -> collect -> close with mocked position manager

### Phase 6: Hyperliquid hardening

- Verify Hyperliquid as CLOB connector with wallet-based TradingAccount credentials
- Test 128-bit clientOrderId formatting through ClobConnector
- Test fill fee mapping, restart recovery, reconciliation blocking on mismatch
- Tests: Hyperliquid CLOB lifecycle with mocked adapter

### Phase 7: Reconciliation and operational safety

- Wire all three reconciliation runners into ReconciliationService
- Add manual-review record creation for mismatches
- Add reservation pause for affected orders on mismatch
- Tests: reconciliation blocks risk-increasing operations for all connector families

### Phase 8: Admin UI updates

- Admin direct create form: exchangeType selector, connector picker, TradingAccount picker for DEX
- Strategy templates filter by connector capabilities
- Runtime status views: CLOB tracked orders, on-chain tx state, LP position state, gas/fee ledger facts
- Reconciliation block visibility

## Out of Scope

- Raydium/Solana support (deferred, EvmDexAdapter documents SolanaDexAdapter extension path)
- User-facing funding flow (admin-direct only for now)
- CEX credential migration to TradingAccount (TODO for future phase)
- Generic DEX aggregator routing
- Cross-chain bridging
- MEV protection beyond slippage and deadline controls
- On-chain CLOB (clob_dex) execution
- clob_dex ExchangeType remains rejected until designed

## Acceptance Criteria

1. Hyperliquid is formally modeled as a CLOB connector, not AMM
2. Uniswap/PancakeSwap swap execution is userOrderId-attributed, ledgerOrderId-settled, and receipt-confirmed
3. LP positions have a durable userOrderId / ledgerOrderId attributed lifecycle: open -> monitor -> rebalance -> collect fees -> close
4. Gas, slippage, LP fees, failed txs, and reversals are represented with typed ledger/reconciliation paths
5. Controllers remain side-effect-free and tick remains non-blocking (on-chain confirmation is async)
6. Reconciliation can block risk-increasing operations for CLOB, AMM swap, and CLMM LP mismatches
7. New connector/on-chain service contracts and persistence records carry userOrderId, ledgerOrderId, and accountLabel; balance mutation paths are keyed by ledgerOrderId + asset
8. The Connector interface is unified (submitAction/cancelAction/queryState) with EvmDexAdapter as the chain-family-specific lower layer
9. All existing DEX-related modules are renamed to use connector-based naming

---

## Open Issues and Proposed Solutions (Pending Approval)

The following issues were identified during design review. They are documented here as proposed solutions pending approval before being merged into the main plan body. The numbering follows the original review.

### Issue 1: Commingled on-chain wallet vs per-ledgerOrderId balance invariant

**Problem:** CLOB gets balance isolation via per-account API keys. On-chain, `getSignerForPurpose(purpose, chainId)` implies one wallet holding tokens for many ledgerOrderIds at once. The chain only knows the wallet total; the ledger claims balances are scoped per `ledgerOrderId + asset`. Without a wallet-level reconciliation that verifies `sum(ledger balances across orders) == on-chain wallet balance per asset`, the "ledger is source of truth" invariant is unverifiable on-chain.

**Proposed solution: Add WalletBalanceReconciliationRunner as a first-class reconciliation dimension.**

```text
WalletBalanceReconciliationRunner (new):
  For each (tradingAccountId, chainId, asset):
    1. Read on-chain wallet token balance (erc20.balanceOf + native balance)
    2. Aggregate ledger: sum(OrderBalance.available + locked + external_locked) for all ledgerOrderId where tradingAccountId = X
    3. Compare: onchainBalance vs ledgerSum
    4. Diff > tolerance -> pause all risk-increasing operations on that wallet, emit manual_review
```

This requires `LedgerEntry` or `OrderBalance` to carry a `tradingAccountId` field so ledger can be aggregated by wallet. The current `LedgerEntry` has no `tradingAccountId` field; this is a required data model addition.

The `external_locked` bucket (funds in LP positions) must be included in the wallet-level sum, otherwise the wallet balance will exceed the ledger sum because some funds are in LP position NFTs.

### Issue 2: In-doubt submission window + nonce management (EVM-specific)

**Problem:** The AMM flow persists `OnchainExecution(status: submitted)` after `submitAction` returns a txHash. If the worker crashes between broadcast and persist, you cannot tell whether the tx hit the mempool. CLOB already solves this with `isAmbiguousPlacementError` / `reconcileInDoubtPlacement`. On-chain EVM requires: allocate a deterministic nonce, persist `created` with `(tradingAccountId, chainId, nonce)` before broadcast, then reconcile by `(account, nonce)`. The plan had a `nonce?` field but no allocator and no serialization across concurrent intents sharing one wallet.

**Note:** Nonce is an EVM-only concept. Solana uses a completely different transaction model (recent_blockhash + signature, optional durable nonce accounts). See Issue 12 below for the EVM/Solana separation.

**Proposed solution: Pre-broadcast nonce allocation + crash recovery.**

```text
NonceAllocatorService (EVM-only, new):
  - Atomic nonce allocation per (tradingAccountId, chainId)
  - Allocates sequential nonces: max(pending OnchainExecution nonce, on-chain transactionCount) + 1
  - Serialized via database row lock or optimistic lock

Modified AMM flow (EVM):
  1. NonceAllocator.preAllocate() -> EvmExecution(status: created, nonce: N)
  2. Broadcast tx with nonce N
  3. On successful broadcast: update EvmExecution(status: submitted, txHash)
  4. On broadcast error:
     - Error before sign/send: update EvmExecution(status: failed), release reservation
     - Error ambiguous (timeout after send): keep status: created, let confirmer reconcile
  5. Crash recovery: query EvmExecution where status in (created, submitted)
     -> check on-chain tx by (walletAddress, nonce)
     -> if tx found and confirmed: process receipt
     -> if tx not found after N blocks: mark failed, release reservation
```

Nonce allocation must be serialized by `(tradingAccountId, chainId)` to prevent duplicate nonces.

### Issue 3: runWithRetries on on-chain submit is dangerous

**Problem:** The current code wraps `executeCycle` in `runWithRetries`. If the tx was broadcast but timed out, retrying can double-spend across nonces. The plan must explicitly disable generic retry for on-chain submit and recover via the confirmer instead.

**Proposed solution: On-chain submit path must NOT use runWithRetries.**

```text
OnchainDexConnector.submitAction (EVM):
  - Submit only once (no runWithRetries)
  - If broadcast fails before sign/send: release reservation, mark failed
  - If broadcast succeeds but receipt pending: let confirmer handle it
  - If error is ambiguous (timeout after send): keep status, let confirmer reconcile by nonce
  - Recovery is via confirmer + nonce reconciliation, not retry
```

### Issue 4: Gas asset funding contradicts no-negative-balance ledger

**Problem:** `gas_debit` is keyed by `ledgerOrderId + gas_asset`. But an order funded with USDC/WETH has no native BNB/ETH/MATIC scope. Reserving/debiting gas against `ledgerOrderId + gas_asset` produces an unfunded/negative balance. The admin-direct funding model must explicitly resolve this contradiction.

**Proposed solution: Gas sponsorship model + per-order gas attribution.**

Separate gas custody from gas attribution:

```text
Custody (balance source):
  - Gas is paid from a wallet-level funding_operator TradingAccount
  - funding_operator account is pre-funded with native token (BNB/ETH/MATIC)
  - gas_debit is keyed by funding_operator's ledgerOrderId + gas_asset
  - WalletBalanceReconciliationRunner verifies funding_operator wallet native balance

Attribution (cost reporting):
  - Each EvmExecution records actualGasCost
  - Performance/PnL calculation attributes gas cost to the initiating userOrderId
  - This is reporting-level attribution, does not affect ledger balance scope
```

This preserves the per-ledgerOrderId invariant (gas debited from funding_operator scope) while allowing per-order gas cost visibility in PnL. If stricter per-order gas accounting is needed later, admin-direct order creation can require explicit native gas funding per ledgerOrderId.

### Issue 5: Token <-> assetId mapping layer

**Problem:** Ledger uses `assetId`; on-chain uses `(chainId, contractAddress, decimals)`. `swap_settle` credit tokenOut by `ledgerOrderId + asset` has no defined mapping. USDC on Ethereum/Polygon/BSC are distinct assets with different decimals. A `(chainId, address) <-> assetId` token registry is required and absent.

**Proposed solution: Add TokenRegistry as a required foundational component.**

```typescript
// New: TokenRegistry
class TokenRegistry {
  resolveAssetId(chainId: number, contractAddress: string): string;
  resolveToken(assetId: string): { chainId, contractAddress, decimals, symbol, isNative };
  resolveNativeAssetId(chainId: number): string; // "BNB_56", "ETH_1", "MATIC_137"
}

// Data table
@Entity('token_registry')
class TokenRegistryEntry {
  assetId: string;          // "USDC_56_0x8AC76A..."
  chainId: number;          // 56
  contractAddress: string;  // 0x8AC76A... (zero address for native)
  symbol: string;           // "USDC"
  decimals: number;         // 18
  isNative: boolean;        // true for BNB/ETH/MATIC
}
```

All on-chain settlement operations must resolve through `TokenRegistry.resolveAssetId()` before writing ledger entries. This must be completed before Phase 4 (AMM swap settlement).

### Issue 6: ERC20 approve and WETH wrap/unwrap txs are unmodeled

**Problem:** Current `ensureAllowance` broadcasts a separate approve tx (own nonce, own gas). The plan's EvmExecution/gas model only covers the swap/LP tx. Approve and wrap/unwrap are extra on-chain txs that need tracking, gas attribution, and nonce slots.

**Proposed solution: Pre-approval out-of-band (MVP) + sub-execution modeling (future).**

```text
MVP approach:
  - Admin pre-sets token allowance via admin UI or script (approve MaxUint256 once)
  - ensureAllowance becomes a read-only check (does not broadcast)
  - If allowance insufficient, intent fails with admin-actionable message
  - One-time approve eliminates per-swap approve txs

Future approach (if needed):
  - EvmExecution gains parentExecutionId field
  - Approve tx -> EvmExecution(type: 'approve', parentExecutionId: swapExecution.id)
  - Wrap/unwrap tx -> EvmExecution(type: 'wrap', parentExecutionId: swapExecution.id)
  - Confirmer handles all EvmExecution records including sub-executions
  - Gas attribution tracks to sub-execution
```

### Issue 7: Failed/reverted swap ledger path

**Problem:** Acceptance criterion 4 mentions failed txs, but no flow shows the revert path. On revert (e.g., slippage exceeded), tokenIn is not spent (release reservation) yet gas is consumed (gas_debit). Only the success path is diagrammed.

**Proposed solution: Explicit revert/fail/dropped ledger flows.**

```text
Reverted tx (receipt status = 0):
  1. Read gasUsed * gasPrice = actualGasCost from receipt
  2. Ledger:
     - reserve_release: release full tokenIn reservation (swap did not execute)
     - gas_debit: deduct actualGasCost from funding_operator scope (gas was consumed)
  3. Update EvmExecution(status: 'reverted', gasUsed, effectiveGasCost)
  4. Release intent reservation
  5. Strategy may emit new retry intent (new nonce, new reservation)

Dropped tx (never mined, expired):
  1. After N blocks, tx still pending
  2. Ledger:
     - reserve_release: release full reservation (tokenIn + gas)
     - No gas_debit (gas not consumed, tx never mined)
  3. Update EvmExecution(status: 'failed')
  4. Note: tx may later be mined (mempool delay), monitor for a grace period
```

### Issue 8: Reorg-after-settlement

**Problem:** `requiredConfirmations` reduces risk but a reorg that drops an already-settled tx needs a reversal emission path. The plan lists "ledger settle without confirmed receipt" but not reorg-triggered reversal.

**Proposed solution: Reorg monitoring + reversal emission.**

```text
EvmReceiptConfirmer continuously monitors confirmed EvmExecution records:
  1. Periodically check if confirmed tx is still in chain (query receipt by txHash)
  2. If previously-confirmed tx receipt disappears (reorg):
     a. Check if tx is re-included after reorg (common, wait a few blocks)
     b. If tx is genuinely reorged out and not re-included:
        - Emit reversal ledger entry (reversalOf = original swap_settle/lp_add_settle entry)
        - Update EvmExecution(status: 'manual_review')
        - Pause affected order's risk-increasing operations
        - Emit manual_review record
  3. requiredConfirmations per chain: Ethereum 12, BSC 15, Polygon 20
```

### Issue 9: Stuck-pending resolution

**Problem:** Phase 3 lists "stuck pending" but no design for replacement (speed-up), cancel-by-self-tx, nonce gap repair, or how long reservations stay locked.

**Proposed solution: Replacement + timeout + nonce gap repair.**

```text
Stuck-pending handling:
  1. Timeout: tx not confirmed within N blocks (configurable, suggest 50 blocks)
  2. Speed-up: resubmit with same nonce + higher gas price (replacement tx)
     - EvmExecution gains replacedByExecutionId field
     - Original execution status -> 'replaced', new execution status -> 'submitted'
     - Reservation stays locked (tx may still confirm)
  3. Cancel (on strategy stop): send self-transfer with same nonce + higher gas price
     - If original tx still in mempool, it gets replaced
     - If original tx already mined, cancel tx executes as normal self-transfer
  4. Nonce gap repair:
     - If nonce N tx failed/dropped, nonce N+1 tx will be stuck forever
     - Confirmer detects nonce gaps across EvmExecution records
     - Resubmit nonce N tx or send dummy tx to fill gap
  5. Reservation timeout:
     - If tx stuck beyond M blocks and speed-up fails
     - Move EvmExecution to manual_review
     - Release reservation but flag order for manual inspection
```

### Issue 10: LP reconciliation feasibility / IL tolerance

**Problem:** A CLMM position's token0/token1 amounts are a continuous function of price; `external_locked` is a fixed deposit figure. Comparing "LP ledger entries against actual position value" needs a defined tolerance and treatment of impermanent loss. Without this, the LP runner cannot be implemented deterministically.

**Proposed solution: Structural consistency checks, not absolute amount checks.**

```text
LpPositionReconciliationRunner checks:
  1. Position existence: OrderLpPosition.positionTokenId NFT exists on-chain and belongs to tradingAccount wallet
  2. Liquidity match: OrderLpPosition.liquidity == on-chain position.liquidity
  3. Tick range match: OrderLpPosition.tickLower/tickUpper == on-chain position.tickLower/tickUpper
  4. Status consistency:
     - on-chain liquidity > 0 and in range -> status should be 'active'
     - on-chain liquidity > 0 and out of range -> status should be 'out_of_range'
     - on-chain liquidity == 0 -> status should be 'closed'
  5. Fee tolerance:
     - Compute on-chain uncollected fees (via quadrature formula)
     - Compare with OrderLpPosition.uncollectedFees0/1
     - Tolerance: 0.1% (fee calc involves sqrtPrice precision)
  6. NOT checked: absolute token0/token1 amounts (IL is expected behavior)

IL treatment:
  - IL is the delta between lp_add_settle (deposit) and lp_remove_settle (withdrawal)
  - This is a normal component of PnL, not a reconciliation error
  - Performance/PnL reports show IL as part of position return
```

### Issue 11: queryState semantics for AMM and cancelAction no-op

**Problem:** `queryState` for AMM has no post-submit state besides the receipt, and `cancelAction` is a no-op for on-chain. The unified interface should document these as explicit not-supported results rather than silent gaps.

**Proposed solution: Explicit not-supported results + clear queryState semantics.**

```typescript
type ConnectorActionResult = {
  status: 'submitted' | 'confirmed' | 'failed' | 'not_supported';
  // ...
};

// EvmDexConnector:
async cancelAction(intent): Promise<ConnectorActionResult> {
  // On-chain tx cannot be cancelled after submission
  // If tx still in mempool (unconfirmed), can attempt replacement cancel
  const execution = await this.evmExecutionService.findByIntentId(intent.intentId);
  if (execution?.status === 'submitted' && execution.nonce != null) {
    return await this.attemptReplacementCancel(execution); // best-effort
  }
  return { status: 'not_supported', details: { reason: 'on_chain_tx_cannot_be_cancelled' } };
}

async queryState(intent): Promise<ConnectorState> {
  // AMM swap: return EvmExecution status
  const execution = await this.evmExecutionService.findByIntentId(intent.intentId);
  if (!execution) return { status: 'no_execution' };
  return {
    status: execution.status,
    txHash: execution.txHash,
    blockNumber: execution.blockNumber,
    decodedEvents: execution.decodedEvents,
  };
  // CLMM LP: return OrderLpPosition + EvmExecution status (dispatched by intent type)
}
```

### Issue 12: EVM and Solana on-chain execution should not be mixed

**Problem:** The original plan used a generic `OnchainExecution` entity with `nonce?` as a nullable field, implying EVM and Solana could share the same execution model. EVM and Solana have fundamentally different transaction models (EVM: sequential nonce; Solana: recent_blockhash + signature, optional durable nonce). Mixing them leads to nullable fields and if-else branches that violate the project principle of keeping architecture 100% perfect at present.

**Proposed solution: Split on-chain execution by chain family. EVM now, Solana completely separate later.**

```text
EVM (now):
  EvmExecution entity          # nonce is required, not nullable
  EvmExecutionService          # EVM-specific CRUD
  EvmReceiptConfirmerService   # EVM-specific confirmation (block number, confirmations, reorg)
  NonceAllocatorService        # EVM-only

Solana (future, completely independent):
  SolanaExecution entity       # signature, slot, blockhash
  SolanaExecutionService
  SolanaConfirmerService       # Solana-specific (finality slots, expiration)
  No NonceAllocator
```

Correspondingly, `OnchainDexConnector` is renamed to `EvmDexConnector`. Future `SolanaDexConnector` will be a completely separate connector implementation. The Connector interface stays unified at the top level (`submitAction` / `cancelAction` / `queryState`), but internal implementation, entity, service, and confirmer are split by chain family with no shared base.

### Entity and naming updates from Issue 12

The following renames apply throughout the plan body (to be merged upon approval):

| Original plan term | Updated term | Scope |
|---|---|---|
| `OnchainExecution` entity | `EvmExecution` entity | EVM-specific, nonce required |
| `OnchainExecutionService` | `EvmExecutionService` | EVM-specific |
| `OnchainReceiptConfirmerService` | `EvmReceiptConfirmerService` | EVM-specific |
| `onchain_executions` table | `evm_executions` table | EVM-specific |
| `OnchainDexConnector` | `EvmDexConnector` | EVM-specific connector |
| `OnchainConnectorRuntime` | `EvmConnectorRuntime` | EVM-specific runtime |
| `OnchainExecutionReconciliationRunner` | `EvmExecutionReconciliationRunner` | EVM-specific reconciliation |
| `OnchainExecutionModule` | `EvmExecutionModule` | EVM-specific module |

Future Solana equivalents (`SolanaExecution`, `SolanaExecutionService`, `SolanaReceiptConfirmerService`, `SolanaDexConnector`, etc.) will be completely separate, sharing only the Connector interface at the top level.
