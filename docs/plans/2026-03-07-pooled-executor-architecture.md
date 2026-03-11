# Mr.Market Pooled Executor Architecture

**Version:** 3.0
**Date:** 2026-03-11
**Status:** Current Source of Truth
**Scope:** Simplified target architecture for pooled market-making runtime

> This document replaces the more ambitious 2026-03-07 draft.
> The current direction is to support dynamic strategy settings with the smallest viable set of architectural changes.

---

## Executive Summary

Mr.Market is a multi-user market making bot. Users create orders via Mixin, and the bot runs built-in strategy controllers on their behalf.

For this phase, the architecture is intentionally narrow:

1. Strategy settings are dynamic and stored in DB
2. Strategy logic stays in built-in server code
3. Strategy schema uses JSON only
4. Execution is pooled per `exchange:pair`
5. Orders snapshot resolved config at creation time
6. Import/export, dynamic code execution, and multi-account execution are postponed

This keeps the system flexible where the product needs flexibility today, while avoiding a second runtime platform.

---

## Key Design Decisions

1. **Single Strategy Model**: One `StrategyDefinition` table with versioned config
2. **Dynamic Settings, Static Logic**: Config is dynamic in DB, but controller code is still registered in server code
3. **JSON Only**: Config schema and default config are stored as JSON
4. **Pair-Level Pooling**: One executor per `exchange:pair` in this phase
5. **Pinned Order Snapshot**: Orders store resolved config at creation time, runtime never re-resolves
6. **Minimal Change Bias**: Reuse the existing strategy controller registry, config resolver, tick loop, and intent pipeline
7. **Future Extension Points**: Multi-account execution, dynamic code artifacts, import/export, and stronger funding isolation are explicitly deferred

---

## In Scope

1. Admin-managed strategy definitions with JSON config
2. User-selected strategy + config overrides at order creation (via Mixin transfer)
3. Pooled execution by exchange-pair
4. Order-level snapshotting for reproducibility
5. Campaign rewards based on bot API key (not per-order)
6. Redis trade aggregation and daily summaries

## Out of Scope For This Phase

1. DB-stored TypeScript strategy code
2. Runtime script compilation or sandboxing
3. Hummingbot import/export
4. Multiple live execution accounts per exchange
5. New order funding reservation state machine

---

## Architecture Overview

```text
┌──────────────────────────────────────────────────────────────┐
│                         User Layer                           │
│   User creates order -> selects strategy -> sends funds      │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                  Strategy Definition Layer                    │
│  StrategyDefinition (single table with versioned config)     │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                    Order Orchestration Layer                  │
│  MarketMakingOrder                                            │
│  strategySnapshot { version, controllerType, resolvedConfig } │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                    Pooled Executor Layer                      │
│  ExecutorRegistry: exchange:pair -> ExchangePairExecutor      │
│  Shared market data + per-order runtime sessions              │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                 Built-In Controller Layer                     │
│  StrategyControllerRegistry                                   │
│  pureMarketMaking | arbitrage | volume | ...                 │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│             Intent / Exchange / Campaign Layer                │
│  ExecutorOrchestrator -> intent store/worker -> exchange      │
│  Redis trade aggregation -> daily summaries/rewards           │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Strategy Definition Layer

Single table for strategy catalog with versioned config.

```typescript
interface StrategyDefinition {
  id: string;
  key: string; // e.g. "pure_market_making"
  name: string;
  description?: string;
  controllerType:
    | 'pureMarketMaking'
    | 'signalAwareMarketMaking'
    | 'arbitrage'
    | 'volume';
  configSchema: Record<string, unknown>; // JSON schema
  defaultConfig: Record<string, unknown>;
  version: string; // e.g. "1.0.0", increment on config changes
  enabled: boolean;
  visibility: 'system' | 'instance';
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

- `controllerType` must map to a built-in controller registered in code
- `configSchema` and `defaultConfig` are stored directly in the definition
- `version` is incremented when admin updates schema or defaults (manual or auto)
- Orders snapshot the `version` string for reference, but don't need to query back

### 2. Order Layer

Orders store resolved config at creation time. Runtime never re-resolves.

```typescript
interface MarketMakingOrder {
  id: string;
  userId: string;
  marketMakingPairId: string;
  strategyDefinitionId: string;
  exchange: string;
  pair: string;
  strategySnapshot: {
    definitionVersion: string; // for reference/audit only
    controllerType: string;
    resolvedConfig: Record<string, unknown>;
  };
  state:
    | 'payment_pending'
    | 'payment_complete'
    | 'running'
    | 'stopped'
    | 'failed';
  startTime?: Date;
  endTime?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

**Note:** Orders do not have direct campaign binding. Campaign rewards are calculated based on the bot's API key that executed the trades, not per-order.

### 3. Pooled Executor Layer

The executor boundary for this phase is intentionally simple:

- key: `exchange:pair`
- all orders on the same pair share market data and execution scheduling
- each order keeps isolated runtime session state

Executor lifecycle:
- Created on-demand when first order for `exchange:pair` is added
- Removed automatically when no active orders remain for that `exchange:pair`

Future multi-account support can extend the key to `exchange:apiKeyId:pair`, but that is not part of the current architecture.

```typescript
class ExecutorRegistry {
  private executors: Map<string, ExchangePairExecutor> = new Map();

  getOrCreateExecutor(exchange: string, pair: string): ExchangePairExecutor;
  removeExecutorIfEmpty(exchange: string, pair: string): void;
  getExecutor(exchange: string, pair: string): ExchangePairExecutor | undefined;
  getActiveExecutors(): ExchangePairExecutor[];
}

class ExchangePairExecutor {
  readonly exchange: string;
  readonly pair: string;

  private readonly marketDataProvider: MarketDataProvider;
  private readonly clientOrderTracker: ClientOrderTracker;
  private readonly strategySessions: Map<string, StrategySession> = new Map();

  async addOrder(orderId: string, userId: string, runtimeConfig: RuntimeConfig): Promise<StrategySession>;
  async removeOrder(orderId: string): Promise<void>;
  async onTick(ts: string): Promise<void>;
  async onFill(fill: FillEvent): Promise<void>;
  async health(): Promise<boolean>;
}
```

#### Same-Price Order Handling

Scenario: Multiple orders on same `exchange:pair` want to place orders at the same price level.

**Phase 1 (Current): Allow Overlap**

- Each order executes independently
- Exchange handles fill priority naturally (FIFO or pro-rata)
- Users with same spread on same pair both provide liquidity - no conflict
- Simple implementation, isolated sessions

**Phase 2 (Future Optimization): Batch Same-Price Orders**

Only needed if API rate limit becomes a bottleneck:

```typescript
class OrderBatch {
  // Group actions by price
  groupByPrice(actions: ExecutorAction[]): Map<string, ExecutorAction[]>;

  // Merge into single exchange order, record allocation ratios
  createBatchOrder(actions: ExecutorAction[]): BatchExchangeOrder;

  // Distribute fill by ratio when fill arrives
  distributeFill(fill: FillEvent): Map<string, number>;
}
```

Phase 2 is deferred because:
- Users typically have different spread configs, reducing overlap
- Rate limits are usually sufficient for market making patterns
- Adds complexity for fill allocation

### 4. Built-In Controller Layer

Dynamic strategy settings do not imply dynamic code execution.

Runtime logic stays in built-in controllers:

- `pureMarketMaking`
- `signalAwareMarketMaking`
- `arbitrage`
- `volume`

The existing controller registry remains the source of truth for executable strategy logic.

```typescript
interface StrategyController {
  readonly strategyType: string;
  buildInitialSession(config: RuntimeConfig): StrategySessionState;
  onTick(session: StrategySessionState, marketData: MarketDataSnapshot): ExecutorAction[];
  onFill(session: StrategySessionState, fill: FillEvent): ExecutorAction[];
}
```

### 5. Config Resolution

Config resolution at order creation:

1. load `StrategyDefinition`
2. merge `defaultConfig` + order overrides → `resolvedConfig`
3. validate `resolvedConfig` against `configSchema`
4. persist `resolvedConfig` into `strategySnapshot`

After creation, runtime only reads `strategySnapshot.resolvedConfig`.

```typescript
class StrategyConfigResolverService {
  async resolveForOrderCreation(
    definitionId: string,
    orderOverrides?: Record<string, unknown>,
  ): Promise<{
    definitionVersion: string;
    controllerType: string;
    resolvedConfig: Record<string, unknown>;
  }> {
    // 1. load StrategyDefinition
    // 2. merge defaultConfig + overrides
    // 3. validate against configSchema
    // 4. return snapshot payload
  }
}
```

### 6. Campaign And Trade Aggregation

Campaign logic is independent of orders.

- Bot's API key joins campaigns (via signed message), not individual orders
- All trades executed with the same API key are counted towards active campaigns
- Orders can benefit from zero, one, or multiple campaigns simultaneously
- Campaigns are linked by `exchange:pair`
- Fills are aggregated in Redis
- `OrderDailySummary` remains the persistent daily reporting table

**Key insight:** Campaign participation is at the bot/API key level, not the order level.

---

## JSON Schema Format

JSON is the only schema format for this phase.

### Example

```json
{
  "type": "object",
  "required": ["bidSpread", "askSpread", "orderAmount", "orderRefreshTime"],
  "additionalProperties": false,
  "properties": {
    "bidSpread": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.001,
      "title": "Bid Spread",
      "description": "Spread from mid price for bid orders"
    },
    "askSpread": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.001,
      "title": "Ask Spread",
      "description": "Spread from mid price for ask orders"
    },
    "orderAmount": {
      "type": "number",
      "minimum": 0,
      "default": 0.001,
      "title": "Order Amount"
    },
    "orderRefreshTime": {
      "type": "number",
      "minimum": 1,
      "default": 60,
      "title": "Order Refresh Time"
    }
  }
}
```

### Validation Rules

1. Schema must be an object schema
2. Only JSON-supported types are allowed
3. `defaultConfig` must validate against `configSchema`
4. Order overrides must validate against the same schema before order creation
5. Unknown fields are rejected when `additionalProperties` is `false`

---

## Execution Flows

### 1. Admin Strategy Flow

```text
Admin creates/updates StrategyDefinition
  -> choose built-in controllerType
  -> submit JSON configSchema + defaultConfig
  -> save (increment version if updating)
```

### 2. User Order Creation Flow (Mixin-based)

```text
User calls POST /intent with strategyDefinitionId + overrides
  -> server generates memo
  -> user transfers funds via Mixin with memo
  -> SnapshotService receives transfer
  -> load StrategyDefinition
  -> merge defaultConfig + order overrides
  -> validate against configSchema
  -> persist MarketMakingOrder.strategySnapshot
  -> attach order to ExchangePairExecutor(exchange, pair)
```

### 3. Tick Execution Flow

```text
Clock tick
  -> ExecutorRegistry iterates active exchange:pair executors
  -> ExchangePairExecutor loads market data
  -> each StrategySession calls built-in controller onTick()
  -> actions are sent to ExecutorOrchestrator
  -> intents are persisted/executed by existing intent pipeline
```

### 4. Fill Handling Flow

```text
Private stream fill arrives
  -> parse parent orderId from clientOrderId
  -> resolve order's exchange + pair
  -> route fill to ExchangePairExecutor(exchange, pair)
  -> session onFill()
  -> record trade in Redis
```

#### clientOrderId Format

Format: `{orderId}:{seq}`

```typescript
function buildClientOrderId(orderId: string, seq: number): string {
  return `${orderId}:${seq}`;
}

function parseClientOrderId(clientOrderId: string): { orderId: string; seq: number } | null {
  const parts = clientOrderId.split(':');
  if (parts.length !== 2) return null;
  const [orderId, seqStr] = parts;
  const seq = parseInt(seqStr, 10);
  if (isNaN(seq)) return null;
  return { orderId, seq };
}
```

Prerequisite: `orderId` uses UUID format (no `:` character)

#### Parse Failure Handling

```text
Fill arrives with clientOrderId
  ↓
Parse success → route to order
  ↓
Parse fail → fallback chain:
  1. Look up by exchangeOrderId (mapping stored when placing order)
  2. Log as orphaned fill with exchange/pair/side/time
  3. Alert for manual review
```

Mapping table for fallback:

```typescript
interface ExchangeOrderMapping {
  orderId: string;         // our order
  exchangeOrderId: string; // exchange returned
  clientOrderId: string;   // we sent
  createdAt: Date;
}
```

---

## Data Models

### Core Entities

```typescript
interface OrderDailySummary {
  id: string;
  orderId: string;
  date: string; // YYYY-MM-DD
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

### Removed From This Phase

The following concepts are intentionally not part of the design:

1. `StrategyDefinitionVersion` (separate version table - over-engineering)
2. `StrategyScript`
3. `StrategyConfigSchema` as a separate entity
4. `OrderExecutionBinding`
5. `OrderFundingReservation`
6. runtime TypeScript compilation
7. TOML schema support
8. import/export flows

---

## API Surface

### User-Facing

```typescript
GET /user-orders/market-making/strategies
GET /user-orders/market-making/strategies/:id
POST /user-orders/market-making/intent     // Generate memo for Mixin transfer
GET /user-orders/market-making/orders/:orderId
POST /user-orders/market-making/orders/:orderId/stop
```

**Order Creation Flow (Mixin-based):**
1. User calls `POST /intent` with strategy selection and config overrides
2. Server returns a memo string
3. User transfers funds via Mixin with the memo
4. SnapshotService processes the transfer and creates the order

### Admin

```typescript
GET /admin/strategy/definitions
POST /admin/strategy/definitions
PUT /admin/strategy/definitions/:id
PATCH /admin/strategy/definitions/:id/enable
PATCH /admin/strategy/definitions/:id/disable
```

Admin endpoints manage strategy definitions directly. No separate publish step.

---

## File Structure

```text
server/src/
├── common/entities/market-making/
│   └── strategy-definition.entity.ts
├── modules/market-making/strategy/
│   ├── controllers/
│   │   ├── strategy-controller.registry.ts
│   │   ├── pure-market-making-strategy.controller.ts
│   │   ├── arbitrage-strategy.controller.ts
│   │   └── volume-strategy.controller.ts
│   ├── dex/
│   │   └── strategy-config-resolver.service.ts
│   ├── execution/
│   │   ├── strategy-intent-store.service.ts
│   │   ├── strategy-intent-worker.service.ts
│   │   └── strategy-intent-execution.service.ts
│   ├── intent/
│   │   ├── executor-orchestrator.service.ts
│   │   └── quote-executor-manager.service.ts
│   └── strategy.service.ts
├── modules/market-making/tick/
├── modules/market-making/trackers/
├── modules/market-making/user-orders/
├── modules/market-making/rewards/
└── modules/admin/strategy/
```

---

## Migration Path

### Phase 1: Single Strategy Table

1. keep `StrategyDefinition` with `configSchema` and `defaultConfig` fields
2. add `version` string field
3. remove any separate version tables

### Phase 2: Order Snapshot

1. store `definitionVersion`, `controllerType`, `resolvedConfig` in snapshot
2. runtime reads only from snapshot after creation

### Phase 3: Pair-Level Executor

1. executor key is `exchange:pair`
2. route fills by `orderId` -> order -> exchange/pair

### Phase 4: Deferred Extensions

Only after the simplified version is stable:

1. dynamic executable artifacts
2. import/export
3. multi-account execution
4. stronger funding isolation

---

## Configuration

```bash
STRATEGY_TICK_SIZE_MS=1000
STRATEGY_INTENT_EXECUTION_DRIVER=worker
STRATEGY_RUN=true
STRATEGY_EXECUTE_INTENTS=true
STRATEGY_EXCHANGE_MIN_REQUEST_INTERVAL_MS=200
CAMPAIGN_REWARD_CRON="0 0 * * *"
REDIS_TRADE_BUFFER_TTL=72
```

---

## Monitoring

### Key Metrics

1. tick duration
2. active orders per exchange-pair
3. intent processing latency
4. exchange API latency
5. Redis trade aggregation latency
6. daily reward processing lag

### Health Checks

```typescript
GET /health/executors
GET /health/campaign-tracking
```

---

## Deferred Questions

### Future Considerations

1. Should user presets remain a pure UI convenience, or become a first-class domain entity later?
2. When multi-account execution is needed, can `exchange:pair` be extended to `exchange:apiKeyId:pair` without breaking order snapshots?
3. If stronger balance isolation is required later, should it be modeled at order start or in the ledger layer?
4. If admin-authored executable logic is ever allowed, should it be a separate architecture document instead of extending this one?
5. When should Phase 2 batch optimization for same-price orders be implemented? (Only if rate limit becomes bottleneck)

---

## Summary

This plan follows Occam's Razor:

- one strategy table with versioned config
- one schema format: JSON
- one executor boundary: `exchange:pair`
- one runtime logic source: built-in controllers

Orders snapshot resolved config at creation. Runtime never re-resolves. Simple and sufficient.
