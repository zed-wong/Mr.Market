# Improve Architecture Plan

## Goal

Refactor Mr.Market from a market-making bot runtime into an order-bound, quota-safe, HuFi-native execution runtime.

The target architecture should follow Hummingbot V2's useful separation:

```text
Config -> Controller -> Action -> Executor -> State / Report
```

but Mr.Market's source of truth must remain DB-backed and order-bound:

```text
Mr.Market order -> StrategyConf -> order balance/quota -> exchange order -> fill ledger -> reward attribution
```

This is not a Hummingbot clone. Hummingbot's YAML/controller/executor model is a reference for separation of responsibilities. Mr.Market also needs user fund isolation, campaign reward attribution, fee accounting, and auditability.

## Current Baseline

The current codebase already has useful foundations:

- `StrategyDefinition` stores strategy templates with `controllerType`, `configSchema`, and `defaultConfig`.
- `MarketMakingOrder.strategySnapshot` pins resolved config at order creation.
- `StrategyController.decideActions()` separates strategy decisions from direct exchange side effects.
- `StrategyIntentExecutionService` submits exchange actions through the connector adapter.
- `tracked_order` and `exchange_order_mapping` connect exchange orders back to Mr.Market orders.
- Ledger/read-model code exists, but it is not yet order-level quota accounting.

The main gap is that the runtime is not yet organized around the real Mr.Market facts: order-bound config, order-level balance, exchange-order reservation, fill ledger, fee accounting, and reward attribution.

## Target Architecture

### Entity and type naming policy

Entity and type names should reflect the bounded module that owns the business fact. The name should not mechanically mirror a temporary Nest folder, but the owning domain must be visible in the class/type name and file path.

New entities introduced by this architecture must use explicit bounded-context names:

```text
MarketMakingStrategyConf
MarketMakingOrderBalance
MarketMakingExchangeOrder
MarketMakingOrderReservation
MarketMakingFill
CampaignRewardLedger
CampaignRewardAllocation
```

Avoid vague nouns for new entities:

```text
TrackedOrder
BalanceReadModel
History
Performance
PaymentState
Contribution
```

Existing entities should not be renamed broadly. Selectively rename only the most ambiguous entities that sit directly on the migration path, and prefer TypeScript class/file clarity over physical DB table renames.

Safe rename pattern:

```ts
@Entity({ name: 'tracked_order' })
export class MarketMakingExchangeOrder {}
```

This improves code readability without forcing a table migration.

Selective rename candidates:

| Current name | Recommended name | Why |
|---|---|---|
| `TrackedOrderEntity` | `MarketMakingExchangeOrder` | It tracks exchange orders, not Mr.Market user orders. |
| `BalanceReadModel` | `UserBalanceReadModel` | Existing table is user-level; new architecture adds order-level balance. |
| `StrategyExecutionHistory` | `StrategyExecutionEvent` or replace with `MarketMakingFill` for fills | Current name can be mistaken for fill/trade history. |
| `RewardLedger` | `CampaignRewardLedger` | Reward source is campaign payout lifecycle. |
| `RewardAllocation` | `CampaignRewardAllocation` | Allocation is campaign reward distribution to users. |

Do not rename everything just to match module folders. A rename is justified only when the old name can cause a quota, fill, fee, or reward accounting mistake.

Shared type directories should also reflect the bounded module that owns the contract:

| Type owner | Recommended path | Notes |
|---|---|---|
| Market-making runtime | `server/src/common/types/market-making/` | Strategy config, executor lifecycle, exchange-order status, reservation, order-level balance, fill accounting. |
| HuFi campaign/oracle integration | `server/src/common/types/hufi/` | Oracle payloads, campaign payout DTOs, HuFi-specific external contracts. |
| Exchange connector abstraction | `server/src/common/types/exchange/` | Generic connector/CCXT-facing exchange concepts shared outside market making. |
| Generic order concepts | `server/src/common/types/orders/` | Only for genuinely cross-product order types used by market making, spot, swap, and other flows. |

`server/src/common/types/orders/` should not remain the home for market-making-specific states. During migration it may provide compatibility exports, but new imports should target the owning module path.

### Central market-making status tables

Market-making order and execution states should be centralized under `server/src/common/types/market-making/status/` and imported everywhere. Services should not define their own duplicate state unions or string literals.

The status tables should be code-owned, not admin-configured. These states drive quota release, fill accounting, executor settlement, and reward distribution. They should be versioned with application code and covered by tests.

Recommended files:

```text
server/src/common/types/market-making/status/
  market-making-order-status.ts
  market-making-strategy-conf-status.ts
  market-making-order-executor-status.ts
  market-making-exchange-order-status.ts
  market-making-reservation-status.ts
  market-making-fill-accounting-status.ts
  market-making-strategy-intent-status.ts
  market-making-campaign-reward-status.ts
  index.ts
```

This path intentionally replaces `server/src/common/types/orders/` for market-making-specific statuses. Legacy generic order states can remain under `server/src/common/types/orders/` only while they are shared by non-market-making flows such as spot or simply-grow. `states.ts` should become a compatibility export during migration, then be split or removed.

After the migration, market-making modules should not import status types from `server/src/common/types/orders/`.

Preferred import shape:

```ts
import {
  MarketMakingExchangeOrderStatus,
  MarketMakingOrderExecutorStatus,
} from '../../../common/types/market-making/status';
```

Exported names should include the owning bounded module:

```text
MarketMakingOrderStatus
MarketMakingStrategyConfStatus
MarketMakingOrderExecutorStatus
MarketMakingExchangeOrderStatus
MarketMakingReservationStatus
MarketMakingFillAccountingStatus
MarketMakingStrategyIntentStatus
MarketMakingCampaignRewardStatus
```

Avoid generic names for new market-making status types:

```text
ExchangeOrderStatus
ExecutorStatus
ReservationStatus
FillStatus
RewardStatus
```

Each status file should define one clear status table for that layer. Keep the table focused on stable internal status values; add helpers only when repeated runtime code needs the same check.

Example:

```ts
export const MarketMakingExchangeOrderStatus = {
  PendingCreate: 'pending_create',
  Open: 'open',
  PartiallyFilled: 'partially_filled',
  PendingCancel: 'pending_cancel',
  Filled: 'filled',
  Cancelled: 'cancelled',
  Expired: 'expired',
  Rejected: 'rejected',
  Failed: 'failed',
  Unknown: 'unknown',
} as const;

export type MarketMakingExchangeOrderStatus =
  (typeof MarketMakingExchangeOrderStatus)[keyof typeof MarketMakingExchangeOrderStatus];
```

If runtime code repeatedly needs the same status check, expose a small named helper next to the table instead of duplicating lists across services:

```ts
export function isFinalMarketMakingExchangeOrderStatus(
  status: MarketMakingExchangeOrderStatus,
): boolean {
  return [
    MarketMakingExchangeOrderStatus.Filled,
    MarketMakingExchangeOrderStatus.Cancelled,
    MarketMakingExchangeOrderStatus.Expired,
    MarketMakingExchangeOrderStatus.Rejected,
    MarketMakingExchangeOrderStatus.Failed,
  ].includes(status);
}
```

The status table is the source of truth for state values. Quota, fill ledger, balance, and reward logic should handle those internal statuses explicitly in their own services, not by inspecting raw exchange status strings.

```text
exchange order status = filled
  write fill ledger
  consume reservation
  update order balance

exchange order status = cancelled / expired / failed
  release remaining locked quota
  settle or fail executor
```

### 1. Keep `StrategyDefinition` as a template

`StrategyDefinition` should describe what a strategy can do, not what a user order is currently running.

It should answer:

- Which `controllerType` this definition maps to.
- Which venues and execution capabilities it supports.
- Which config fields exist and what their defaults are.
- Which fields users may override.
- Which fields are safe to update while running.
- Which risk, fee, and quota policies the strategy requires.

`StrategyDefinition` remains editable by admins, but changing it must not rewrite already-created orders.

### 2. Add order-bound `StrategyConf`

`StrategyConf` is the runtime strategy contract for one Mr.Market order.

It is created from:

```text
StrategyDefinition.defaultConfig
+ user config overrides
+ exchange / pair / apiKey binding
+ quota policy
+ fee policy
+ campaign binding
= StrategyConf
```

Suggested fields:

```text
id
orderId
definitionId
controllerType
configVersion
configHash
exchangeName
pair
apiKeyId
accountLabel
resolvedParams
quotaPolicy
feePolicy
campaignId
status
createdAt
updatedAt
```

Runtime startup should read `StrategyConf`, not re-resolve live `StrategyDefinition` data.

### 3. Add order-level balance/quota

Exchange account balances are mixed execution balances. They are not user-order balances.

Add an order-level balance read model keyed by `orderId + assetId`:

```text
orderId
userId
apiKeyId
assetId
free
locked
total
initialDeposit
realizedDelta
feePaid
updatedAt
```

Invariant:

```text
total = free + locked
```

Before placing an exchange order, the executor must reserve quota from this balance. Strategies may only use `free` quota. Open exchange orders hold `locked` quota until they fill, cancel, fail, or settle.

### 4. Record exchange-order reservation

Each exchange order must belong to exactly one Mr.Market order and record its reservation.

Suggested fields on `tracked_order` or a dedicated reservation table:

```text
orderId
strategyConfId
exchangeOrderId
clientOrderId
reservedAssetId
reservedAmount
reservedFeeAssetId
reservedFeeAmount
filledBaseAmount
filledQuoteAmount
feeAssetId
feeAmount
feeSource
liquidityRole
reservationStatus
```

Buy orders reserve quote. Sell orders reserve base. If the fee policy says the exchange may charge fee from the reserved asset, the reservation must include an estimated fee buffer.

On cancel, unfilled reserved quota is released. On fill, reserved quota is consumed and the received asset is credited to the same Mr.Market order balance.

### 5. Add persistent fill ledger

`tracked_order.cumulativeFilledQty` is enough to know current fill progress, but not enough for HuFi reward accounting or financial audit.

Add a persistent fill ledger:

```text
id
orderId
strategyConfId
exchange
apiKeyId
accountLabel
pair
exchangeOrderId
clientOrderId
fillId
side
liquidityRole
price
qty
quoteAmount
feeAssetId
feeAmount
feeSource
executedAt
receivedAt
idempotencyKey
rawPayloadHash
```

Both user-stream fills and REST recovery fills must write through the same idempotent path.

HuFi internal campaign score should be recomputable from this fill ledger.

### 6. Make fee accounting first-class

Fee should be as exact as the available exchange data allows.

Priority:

1. Use actual fee from exchange/CCXT fill or trade data.
2. If actual fee is missing, use maker/taker role plus CCXT market fee.
3. Post-only maker orders use maker fee.
4. IOC, market orders, and taker legs use taker fee.
5. Unknown role uses conservative taker fee.
6. If actual fee arrives later, write a correction instead of silently rewriting history.

Every fill should carry:

```text
feeAmount
feeAssetId
feeSource: actual | ccxt_market | admin | fallback | correction
```

### 7. Evolve intent execution into executor lifecycle

The current intent execution path should become an executor lifecycle boundary.

Controller responsibility:

- Read market data, strategy config, order state, and cached balances.
- Decide desired actions.
- Avoid direct quota mutation or exchange bookkeeping.

Executor responsibility:

- Reserve order quota.
- Submit exchange order.
- Persist tracked order and reservation.
- Process partial fills and terminal fills.
- Calculate fee.
- Update order-level balance.
- Release unused quota on cancel/failure.
- Recover after restart.

Suggested executor lifecycle:

```text
created
reserved
submitted
open
partially_filled
cancelling
cancelled
filled
failed
settled
```

`StrategyIntentExecutionService` can remain during migration, but its role should become command execution inside an `OrderExecutor`, not the main architecture abstraction.

## Phased Implementation

### Phase 0: Type and Status Ownership

- Create `server/src/common/types/market-making/` as the shared type root for market-making contracts.
- Move market-making status tables to `server/src/common/types/market-making/status/`.
- Keep `server/src/common/types/orders/states.ts` only as a temporary compatibility export if existing imports need a staged migration.
- Rename only the worst ambiguous migration-path entities/types, especially exchange-order, reservation, fill, balance, and reward accounting names.
- Use module-qualified exported names such as `MarketMakingExchangeOrderStatus`, not generic names such as `ExchangeOrderStatus`.
- Add focused tests for status value imports and any shared status helpers that affect runtime accounting.

Success criterion:

```text
Market-making runtime code imports market-making-specific states and contracts from common/types/market-making, not common/types/orders.
```

### Phase 1: StrategyConf

- Add order-bound `StrategyConf` model or harden `MarketMakingOrder.strategySnapshot` into that role.
- Move exchange/pair/apiKey/quota/fee/campaign binding into the order-bound config contract.
- Add `configHash` for auditability.
- Ensure runtime startup reads only the order-bound config.

Success criterion:

```text
Existing orders remain unaffected by later StrategyDefinition edits.
```

### Phase 2: Order-Level Balance

- Add `market_making_order_balance`.
- Initialize balances from user deposits.
- Route all market-making quota checks through `orderId + assetId`.
- Keep exchange account balance checks as execution feasibility checks only.

Success criterion:

```text
No strategy can place an exchange order without reserving order-level free quota first.
```

### Phase 3: Reservation-Aware Exchange Orders

- Add reservation fields to tracked orders or create a reservation table.
- Buy orders reserve quote; sell orders reserve base.
- Include fee buffer where fee policy requires it.
- Release remaining locked quota on cancel/failure.

Success criterion:

```text
Every open exchange order can explain which order balance it has locked.
```

### Phase 4: Fill Ledger and Fee Accounting

- Add `market_making_fill`.
- Write fills from user stream and REST recovery through one idempotent service.
- Store actual or estimated fee with `feeSource`.
- Use fill ledger to update order balance.

Success criterion:

```text
Order balance and HuFi internal score can be recomputed from persisted fills.
```

### Phase 5: Executor Lifecycle

- Introduce `OrderExecutor` around quota reservation, exchange submission, fill processing, cancellation, and settlement.
- Keep controllers side-effect-light.
- Move existing intent execution behavior behind executor commands.
- Add restart recovery for non-terminal executors.

Success criterion:

```text
Controller decisions no longer own quota mutation, fill accounting, or cancel-release bookkeeping.
```

### Phase 6: Reward Integration

- Compute campaign internal score from fill ledger.
- Allocate daily campaign payout from net reward pool after platform fee.
- Tie reward allocation records back to fill-ledger-derived score basis.

Success criterion:

```text
Campaign reward allocation is reproducible from campaign payout data and local fill ledger data.
```

## Non-Goals

- Do not clone Hummingbot YAML workflow for users.
- Do not make YAML files runtime source of truth.
- Do not mix DEX execution into this CEX quota/accounting model.
- Do not allow StrategyDefinition edits to mutate existing order behavior.
- Do not treat exchange account balance as user-order balance.

## Open Decisions

- Whether `StrategyConf` should be a new table or a stricter replacement for `MarketMakingOrder.strategySnapshot`.
- Whether reservation lives directly on `tracked_order` or in a separate `market_making_order_reservation` table.
- How long to retain raw fill payloads versus storing only `rawPayloadHash`.
- Which fee fallback rate is acceptable when CCXT market fee data is missing.
- Whether estimated fee corrections should create separate correction fills or separate ledger entries.
