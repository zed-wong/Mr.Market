# Unified Pooled Strategy Runtime Implementation Plan

**Version:** 1.0
**Date:** 2026-03-06
**Status:** Implementation Ready
**Supersedes:**
- `docs/plans/2026-03-06-pooled-executor-architecture.md`
- `docs/plans/2026-03-07-strategy-definition-protocol.md`

---

## Goal

Deliver the final market-making runtime with:

1. Versioned strategy definitions
2. Shared market data and exchange state per pair
3. Per-order strategy isolation
4. Safe pooled execution on shared exchange accounts
5. Campaign-aware reward accounting outside strategy logic
6. Durable, reproducible order starts and restarts

This document is the implementation contract. If it conflicts with the two superseded docs, this document wins.

---

## Non-Goals

These are explicitly out of scope for this implementation:

1. User-uploaded or hot-reloaded production TypeScript strategy scripts
2. In-memory reward-accounting fallback as a normal operating mode
3. Cross-controller pooled quoting in a single executor
4. Migrating every legacy order column in the first rollout phase

---

## Final Decisions

### 1. Strategy definitions are DB-backed and versioned

`StrategyDefinition` is the mutable catalog entry.

`StrategyDefinitionVersion` is the immutable published snapshot used at runtime.

Runtime always starts from a pinned `definitionId + definitionVersion`.

### 2. JSON Schema is the only runtime schema format

YAML, TOML, and Hummingbot-style config files are import/export formats only.

Published definitions store:

- `controllerType`
- `configSchema` as JSON Schema
- `defaultConfig`

Runtime never loads config schemas from filesystem paths.

### 3. `controllerType` is the runtime execution contract

Execution logic is implemented by local compiled controllers registered in the server.

The stable controller contract is:

- `pureMarketMaking`
- `arbitrage`
- `volume`
- `timeIndicator`

If future script-backed execution is added, it must compile or resolve to an immutable published artifact and still expose one of these registered controller contracts. That is not part of this implementation.

### 4. Published versions are immutable

Once published, a definition version cannot change.

Order intent creation pins the version immediately so that:

- later definition edits do not affect pending orders
- restarts reproduce the same runtime config
- rollback is predictable

### 5. Campaign logic stays outside strategy controllers

Controllers do not receive `campaignId`.

Campaign linkage is order/session metadata owned by orchestration and reward services.

Fill processing records campaign data after fills are attributed to sessions.

### 6. Per-order config is snapshotted on the order

User-level reusable presets are optional convenience records only.

Runtime never reads mutable user preset rows when starting or restarting an order.

The only runtime config source is:

1. published definition version defaultConfig
2. order-level config overrides snapshot
3. runtime-derived fields added by orchestration

### 7. Pooling is split into two layers

To keep the design safe and implementation-ready:

1. `MarketContext` is shared per execution account + venue + exchange + pair
2. `ExecutionPool` is shared per market context + controller type

This gives shared trackers and fill routing without mixing incompatible strategy families in one pool.

### 8. Pooled execution must include reservation gates

Shared exchange execution is unsafe without a pair-level reservation manager.

Every create-order action must pass:

1. order-level available balance check
2. pool-level free balance/reservation check
3. self-conflict checks enforced by the pool

No direct create intent bypass is allowed.

---

## Final Architecture

```text
User/API
  -> MarketMakingOrderIntent creation
  -> definition version pinning + config validation
  -> payment completion
  -> MarketMakingOrder snapshot
  -> start_mm
  -> StrategyRuntimeService
  -> MarketContextRegistry
  -> ExecutionPoolRegistry
  -> Controller session tick
  -> Reservation gate
  -> ExecutorOrchestrator
  -> StrategyOrderIntent worker/execution
  -> Exchange
  -> Fill routing
  -> CampaignTradeAggregator
  -> Daily reward accounting
```

### Shared Runtime Layers

#### MarketContext

Key:

`{executionAccountId}:{venue}:{exchange}:{pair}`

Owns:

- `OrderBookTracker`
- `PrivateStreamTracker`
- `MarketDataProvider`
- `ClientOrderTracker`
- `FillRoutingService`

#### ExecutionPool

Key:

`{marketContextKey}:{controllerType}`

Owns:

- all active sessions for the controller family on that pair
- `PairBalanceReservationService`
- controller dispatch on tick/fill/error
- admission control before intents are persisted

#### StrategySession

One per market-making order / strategy instance.

Owns:

- immutable `configSnapshot`
- mutable controller state
- open order ownership
- reservation ownership
- health/status

---

## Runtime Contracts

### Strategy Controller Interface

```typescript
interface StrategyController {
  readonly controllerType:
    | 'pureMarketMaking'
    | 'arbitrage'
    | 'volume'
    | 'timeIndicator';

  validateConfig?(
    configSnapshot: RuntimeConfig,
  ): void | Promise<void>;

  createInitialState(
    configSnapshot: RuntimeConfig,
  ): StrategySessionState;

  onTick(
    session: RuntimeSession,
    marketData: MarketDataSnapshot,
  ): Promise<StrategyAction[]> | StrategyAction[];

  onFill(
    session: RuntimeSession,
    fill: SessionFillEvent,
  ): Promise<StrategyAction[]> | StrategyAction[];

  onError(
    session: RuntimeSession,
    error: Error,
  ): Promise<StrategyAction[]> | StrategyAction[];
}
```

### RuntimeConfig

```typescript
interface RuntimeConfig {
  orderId: string;
  userId: string;
  clientId: string;
  definitionId: string;
  definitionVersion: string;
  controllerType: string;
  exchangeName: string;
  pair: string;
  executionAccountId: string;
  venue: 'cex' | 'dex';
  [key: string]: unknown;
}
```

Rules:

1. `RuntimeConfig` does not contain `campaignId`
2. `RuntimeConfig` is immutable after session creation
3. controllers may mutate session state, not config

### StrategyAction

```typescript
type StrategyAction =
  | {
      type: 'CREATE_LIMIT_ORDER';
      side: 'BUY' | 'SELL';
      price: string;
      qty: string;
      postOnly?: boolean;
      metadata?: Record<string, unknown>;
    }
  | {
      type: 'CANCEL_ORDER';
      clientOrderId: string;
    }
  | {
      type: 'STOP_SESSION';
      reason: string;
    };
```

Rules:

1. create actions are intent candidates, not direct exchange calls
2. every create action is enriched with `orderId`, `sessionId`, `strategyKey`, and reservation metadata by orchestration
3. `clientOrderId` format must be deterministic and unique per live order attempt

---

## Data Model

### 1. Strategy Definition Catalog

### StrategyDefinition

Mutable admin-owned record.

```typescript
interface StrategyDefinition {
  id: string;
  key: string;
  name: string;
  description?: string;
  controllerType:
    | 'pureMarketMaking'
    | 'arbitrage'
    | 'volume'
    | 'timeIndicator';
  enabled: boolean;
  visibility: 'system' | 'public';
  currentVersion: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### StrategyDefinitionVersion

Immutable published runtime snapshot.

```typescript
interface StrategyDefinitionVersion {
  id: string;
  definitionId: string;
  version: string;
  controllerType: string;
  configSchema: JSONSchema;
  defaultConfig: Record<string, unknown>;
  description?: string;
  createdAt: Date;
}
```

Rules:

1. `configSchema` must be JSON Schema with top-level `type: "object"`
2. `additionalProperties: false` is required for published versions
3. publish fails if `controllerType` is not registered locally

### 2. Order Snapshot Records

### MarketMakingOrderIntent

Add:

- `strategyDefinitionId`
- `strategyDefinitionVersion`
- `configOverrides` JSON

Intent creation pins version and validated overrides.

### MarketMakingOrder

Add:

- `strategyDefinitionId`
- `strategyDefinitionVersion`
- `configSnapshot` JSON
- `campaignId` nullable
- `executionAccountId`
- `venue`

Rules:

1. `configSnapshot` is copied from `defaultConfig + configOverrides + pair/exchange-derived values`
2. `start_mm` reads only the order snapshot
3. legacy duplicated config columns may stay temporarily during rollout, but new runtime does not use them once cut over

### StrategyInstance

Keep existing runtime evidence, but require:

- `definitionId`
- `definitionVersion`
- `parameters` = exact runtime config snapshot
- `marketMakingOrderId`

### 3. Optional User Presets

Replace `UserStrategyConfig` with `UserStrategyPreset`.

```typescript
interface UserStrategyPreset {
  id: string;
  userId: string;
  strategyDefinitionId: string;
  name: string;
  configOverrides: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

Rules:

1. presets are optional UX helpers
2. starting an order copies preset data into the order snapshot
3. runtime never dereferences presets

### 4. Reward Accounting

### OrderDailySummary

```typescript
interface OrderDailySummary {
  id: string;
  orderId: string;
  campaignId: string;
  date: string;
  makerVolume: string;
  takerBuyVolume: string;
  takerSellVolume: string;
  totalScore: string;
  tradeCount: number;
  attributedReward?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Validation and Publish Flow

### Admin Definition Publish

When admin publishes a definition version:

1. validate `controllerType` exists in controller registry
2. validate `configSchema` is valid JSON Schema object
3. validate `defaultConfig` against `configSchema`
4. write immutable `StrategyDefinitionVersion`
5. update `StrategyDefinition.currentVersion`

### User Intent Creation

`POST /user-orders/market-making/intent`

Body:

```json
{
  "marketMakingPairId": "pair-id",
  "strategyDefinitionId": "definition-id",
  "configOverrides": {}
}
```

Server behavior:

1. load enabled definition
2. load pinned `currentVersion`
3. validate `defaultConfig + configOverrides`
4. derive pair/exchange execution context
5. store pinned version and validated overrides on intent

The definition version must be pinned here, not at `start_mm`.

---

## Start / Stop Flow

### start_mm

1. load `MarketMakingOrder`
2. require `strategyDefinitionId`, `strategyDefinitionVersion`, `configSnapshot`
3. resolve campaign for the order and store `campaignId` on order
4. create or load `MarketContext`
5. create or load `ExecutionPool`
6. create `StrategyInstance` if absent, or restart from stored runtime snapshot
7. register session into the pool

### stop_mm

1. mark order stopping
2. cancel open orders owned by the session
3. release reservations
4. flush trade summaries for the order and current date
5. unregister session
6. set order state to `stopped`

---

## Fill Routing and Reservation Rules

### Fill Attribution

`ClientOrderTracker` must map:

- `clientOrderId -> orderId`
- `clientOrderId -> strategyInstanceId`
- `clientOrderId -> reservationId`

All fill handling uses this mapping before any reward or balance work.

### Reservation Gate

New service:

`PairBalanceReservationService`

Responsibilities:

1. reserve funds for create-order actions
2. reject create-order actions that exceed order-level virtual balances
3. reject create-order actions that exceed pool-level free exchange balance
4. release reservations on cancel/fill/stop
5. expose pool metrics for debugging

No create intent can be persisted without a successful reservation.

---

## Campaign and Reward Architecture

### Campaign Linkage

Campaign is resolved outside controllers using:

- `exchangeName`
- `pair`
- time window

Order/session metadata stores `campaignId`.

### Trade Aggregation

Use Redis keys scoped by campaign and date:

`campaign_trade:{campaignId}:{date}:{orderId}`

Fields:

- `maker_volume`
- `taker_buy_volume`
- `taker_sell_volume`
- `total_score`
- `trade_count`

This avoids cross-campaign mixing.

### Reward Processing

`processDailyRewards(campaignId, date)` must:

1. read only `campaign_trade:{campaignId}:{date}:*`
2. compute totals only for that campaign and day
3. write `OrderDailySummary` rows for that campaign and day
4. aggregate attributed reward by user
5. credit rewards through `BalanceLedgerService`

### Failure Policy

No silent in-memory fallback for reward data.

If Redis write fails:

1. mark the order/day as `reconciliation_required`
2. continue trading
3. require exchange-trade reconciliation before reward distribution

---

## File Plan

### New Files

- `server/src/modules/market-making/runtime/market-context.registry.ts`
- `server/src/modules/market-making/runtime/market-context.service.ts`
- `server/src/modules/market-making/runtime/execution-pool.registry.ts`
- `server/src/modules/market-making/runtime/execution-pool.service.ts`
- `server/src/modules/market-making/runtime/pair-balance-reservation.service.ts`
- `server/src/modules/market-making/runtime/fill-routing.service.ts`
- `server/src/modules/market-making/rewards/campaign-trade-aggregator.service.ts`
- `server/src/modules/market-making/rewards/order-daily-summary.service.ts`
- `server/src/common/entities/market-making/user-strategy-preset.entity.ts`
- `server/src/common/entities/market-making/order-daily-summary.entity.ts`

### Modified Files

- `server/src/common/entities/market-making/strategy-definition.entity.ts`
- `server/src/common/entities/market-making/strategy-definition-version.entity.ts`
- `server/src/common/entities/market-making/market-making-order-intent.entity.ts`
- `server/src/common/entities/orders/user-orders.entity.ts`
- `server/src/common/entities/market-making/strategy-instances.entity.ts`
- `server/src/modules/admin/strategy/adminStrategy.service.ts`
- `server/src/modules/admin/strategy/admin-strategy.dto.ts`
- `server/src/modules/market-making/user-orders/user-orders.service.ts`
- `server/src/modules/market-making/user-orders/market-making.processor.ts`
- `server/src/modules/market-making/strategy/strategy.service.ts`
- `server/src/modules/market-making/strategy/execution/strategy-runtime-dispatcher.service.ts`
- `server/src/modules/market-making/strategy/config/strategy-controller.types.ts`

### Removed from Final Scope

- production filesystem script loader
- production hot-reload watcher
- runtime `scriptPath` / `configSchemaPath` execution dependency

---

## Implementation Phases

### Phase 1: Definition and Order Snapshot Contract

1. enforce JSON Schema publish validation
2. add `strategyDefinitionVersion` to order intent and order
3. add `configOverrides` to order intent
4. add `configSnapshot` to order
5. update user intent API to validate and snapshot config at creation time

Exit criteria:

- changing a definition after intent creation does not affect the pending order
- `start_mm` can start from the order snapshot without loading mutable user config

### Phase 2: Runtime Pool Foundation

1. add `MarketContextRegistry`
2. add `ExecutionPoolRegistry`
3. add `PairBalanceReservationService`
4. register sessions by `marketContextKey + controllerType`
5. route ticks through pools

Exit criteria:

- multiple sessions on same pair share market context
- create actions are blocked when reservations fail

### Phase 3: Fill Routing and Campaign Aggregation

1. add `FillRoutingService`
2. link client order ids to session/order/reservation ownership
3. add Redis campaign trade aggregator
4. add `OrderDailySummary`

Exit criteria:

- every fill is attributable to one session/order
- reward aggregation is scoped by `campaignId + date`

### Phase 4: Cut Over start_mm / stop_mm

1. make `market-making.processor.ts` use order snapshot only
2. remove direct use of legacy order config columns in runtime start
3. persist `StrategyInstance.parameters` from `configSnapshot`
4. flush summaries and release reservations on stop

Exit criteria:

- restart behavior is deterministic
- live orders survive process restart with same definition version and config

### Phase 5: Presets and Cleanup

1. add optional `UserStrategyPreset`
2. wire preset selection into order intent creation
3. stop runtime reads from any mutable user config table
4. remove obsolete legacy columns once rollout is complete

Exit criteria:

- presets are a UX helper only
- runtime behavior depends only on immutable order snapshots

---

## Testing Requirements

### Unit Tests

1. definition publish rejects invalid JSON Schema
2. intent creation pins version and validates overrides
3. reservation gate blocks oversubscription
4. fill routing attributes fills to the correct order/session
5. reward aggregation reads only one campaign/day scope

### Integration Tests

1. create order -> pay -> start -> stop lifecycle with pinned definition version
2. two orders on same pair share market context without double-spending
3. definition publish after order creation does not mutate running order behavior
4. Redis aggregation plus reconciliation-required path

### End-to-End Tests

1. user fetches strategies, creates intent with overrides, completes payment, and order starts
2. rewards are distributed only from the correct campaign/day totals
3. process restart restores the same sessions from durable snapshots

---

## Acceptance Criteria

This plan is complete only when all of the following are true:

1. orders start from pinned definition versions, not mutable definitions
2. runtime config is snapshotted on the order
3. controllers do not receive campaign context
4. pooled execution includes reservation gates
5. reward accounting is campaign-scoped and date-scoped
6. no production runtime path depends on mutable filesystem scripts

---

## Notes

This plan deliberately chooses reproducibility and operational safety over dynamic production script loading.

If script-backed strategies are revisited later, they must be introduced as immutable published artifacts behind the same definition-version contract, not as mutable live filesystem paths.
