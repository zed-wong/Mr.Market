# Pooled Executor Implementation TODO

**Date:** 2026-03-11
**Status:** Implemented in code
**Related:** [Architecture Doc](./2026-03-07-pooled-executor-architecture.md)

---

## Not In Scope (Already Exists)

- Admin StrategyDefinition CRUD - `admin.controller.ts`, `adminStrategy.service.ts`
- User GET /market-making/strategies - `user-orders.controller.ts:87`
- StrategyConfigResolverService base - `strategy-config-resolver.service.ts` (extend only)

---

## Phase 2: Snapshot Mechanism

### #2 Add strategySnapshot column to MarketMakingOrder

**Description:** Add JSON column to store resolved config snapshot

**Changes:**
```typescript
@Column('simple-json', { nullable: true })
strategySnapshot?: {
  definitionVersion: string;
  controllerType: string;
  resolvedConfig: Record<string, unknown>;
};
```

**Files:** `user-orders.entity.ts`
**Blocked By:** -
**Migration:** Required

---

### #13 Extend StrategyConfigResolverService for snapshot

**Description:** Extend existing service to generate snapshot payload

**Changes:**
- Add `resolveForOrderSnapshot(definitionId, overrides)` method
- Return `{ definitionVersion, controllerType, resolvedConfig }`
- Reuse existing `validateConfigAgainstSchema()`

**Files:** `strategy-config-resolver.service.ts`
**Blocked By:** -

---

### #14 Add configOverrides to intent API and persist them

**Description:** Accept config overrides in intent API AND persist to intent record

**Changes:**
```typescript
// API body
{
  marketMakingPairId: string;
  strategyDefinitionId: string;
  configOverrides?: Record<string, unknown>;  // NEW
}

// Persist to MarketMakingOrderIntent
configOverrides: Record<string, unknown> | null;
```

**Files:**
- `user-orders.controller.ts:114-130`
- `user-orders.service.ts:206-261`
- `market-making-order-intent.entity.ts`

**Blocked By:** -

---

### #9 Store snapshot in order creation flow

**Description:** Write snapshot when payment completes and MarketMakingOrder is created

**Write Point:** SnapshotService processes transfer → creates MarketMakingOrder
**Call:** `StrategyConfigResolverService.resolveForOrderSnapshot()`

**Files:** `user-orders.service.ts` (snapshot handling)
**Blocked By:** #2, #13, #14

---

### #15 Change start_mm to prefer snapshot with legacy fallback

**Description:** Dual-read compatibility - prefer snapshot, fallback to old logic if missing

**Logic:**
```typescript
if (order.strategySnapshot?.resolvedConfig) {
  // New path: read from snapshot
  const { controllerType, resolvedConfig } = order.strategySnapshot;
  const strategyType = toStrategyType(controllerType);
  await dispatcher.startByStrategyType(strategyType, resolvedConfig);
} else {
  // Legacy path: query definition + merge config
  // ... existing code ...
}
```

**Files:** `market-making.processor.ts:993-1089`
**Blocked By:** #9, #13

---

### #17 Backfill snapshot for existing orders

**Description:** Fill snapshot for orders that don't have it, output results

**Process:**
1. Query orders where `strategySnapshot IS NULL`
2. Use existing `resolveDefinitionStartConfig()` with order fields
3. Save snapshot to order
4. Output: `{ total, success, failed, failedOrderIds }`

**Test:** Definition update does NOT affect backfilled orders

**Files:** Migration script
**Blocked By:** #2, #13, #15

---

### #18 Finalize snapshot-only cutover

**Description:** Remove fallback logic after backfill verification

**Prerequisite:** #17 backfill results verified OK
**Action:** Delete legacy code path in start_mm

**Files:** `market-making.processor.ts`
**Blocked By:** #15, #17

---

## Phase 3: Pooled Executor

### #4 Create ExchangePairExecutor class

**Description:** Executor with exchange:pair as shared market-data/tick boundary

```typescript
class ExchangePairExecutor {
  readonly exchange: string;
  readonly pair: string;
  private readonly marketDataProvider: MarketDataProvider;
  private readonly clientOrderTracker: ClientOrderTracker;
  private readonly strategySessions: Map<string, StrategySession>;

  async addOrder(orderId, userId, config): Promise<StrategySession>;
  async removeOrder(orderId): Promise<void>;
  async onTick(ts): Promise<void>;
  async onFill(fill): Promise<void>;
}
```

**Files:** `execution/exchange-pair-executor.ts`
**Blocked By:** -

---

### #5 Create ExecutorRegistry

**Description:** Manage ExchangePairExecutor lifecycle

```typescript
class ExecutorRegistry {
  getOrCreateExecutor(exchange, pair): ExchangePairExecutor;
  removeExecutorIfEmpty(exchange, pair): void;
  getExecutor(exchange, pair): ExchangePairExecutor | undefined;
  getActiveExecutors(): ExchangePairExecutor[];
}
```

**Lifecycle:**
- Created on-demand when first order added
- Removed automatically when no orders remain

**Files:** `execution/executor-registry.ts`
**Blocked By:** -

---

### #6 Implement clientOrderId format and parsing

**Description:** Unified clientOrderId format with helpers

**Format:** `{orderId}:{seq}`

```typescript
function buildClientOrderId(orderId: string, seq: number): string {
  return `${orderId}:${seq}`;
}

function parseClientOrderId(clientOrderId: string): { orderId: string; seq: number } | null {
  const parts = clientOrderId.split(':');
  if (parts.length !== 2) return null;
  const seq = parseInt(parts[1], 10);
  if (isNaN(seq)) return null;
  return { orderId: parts[0], seq };
}
```

**Prerequisite:** orderId uses UUID format (no `:`)

**Files:** `helpers/client-order-id.ts`
**Blocked By:** #4, #5

---

### #7 Create ExchangeOrderMapping entity

**Description:** Record mapping for fill routing fallback

```typescript
interface ExchangeOrderMapping {
  orderId: string;         // our order
  exchangeOrderId: string; // exchange returned
  clientOrderId: string;   // we sent
  createdAt: Date;
}
```

**Files:** `exchange-order-mapping.entity.ts`
**Blocked By:** #4, #5

---

### #8 Update fill routing logic

**Description:** Route fills with fallback chain

**Flow:**
```
Fill arrives with clientOrderId
  ↓
Parse clientOrderId → success → route to order
  ↓
Parse fail → lookup ExchangeOrderMapping by clientOrderId
  ↓
Not found → log orphaned fill for manual review
```

**Files:** Fill handling service
**Blocked By:** #6, #7

---

### #10 Migrate StrategyService to use pooled executors

**Description:** Move session boundary from strategyKey to exchange:pair

**Changes:**
- Keep controller registry
- Keep intent pipeline
- Replace `sessions: Map<strategyKey, session>` with `ExecutorRegistry`
- Route tick/fill through `ExchangePairExecutor`

**Files:** `strategy.service.ts`
**Blocked By:** #4, #5, #8, #18

---

## Phase 4: Verification

### #19 Tests + migration verification

**Description:** Comprehensive test coverage

**Test Cases:**
1. **Snapshot固化** - Order config unchanged after creation
2. **Definition变更隔离** - Definition update doesn't affect existing orders
3. **Backfill** - Old orders get correct snapshot
4. **Attach/detach** - Executor lifecycle management
5. **Fill routing** - clientOrderId parsing + mapping fallback

**Files:** `*.spec.ts`
**Blocked By:** #9, #17, #18, #8, #10

---

## Independent Evaluation

### #16 [EVALUATE] Remove StrategyDefinitionVersion table

**Description:** Evaluate after snapshot mechanism is stable

**Result (2026-03-11):** Keep `StrategyDefinitionVersion` for now. See [2026-03-11-strategy-definition-version-evaluation.md](./2026-03-11-strategy-definition-version-evaluation.md)

**Dependencies to address:**
- Admin publish flow
- Version list endpoint
- StrategyInstance.definitionVersion binding
- Frontend types
- Startup chain

**Decision:** Do NOT block other tasks on this

**Files:**
- `strategy-definition-version.entity.ts`
- `adminStrategy.service.ts`

**Blocked By:** -

---

## Execution Order

```
Batch 1 (parallel): #2 #13 #14 #4 #5 #16
Batch 2:            #9 #6 #7
Batch 3:            #15 #17 #8
Batch 4:            #18 #10
Batch 5:            #19
```

---

## Key Implementation Constraints

1. **#14** must include intent persistence, not just API input
2. **#9** write point = payment complete → MarketMakingOrder creation
3. **#15/#18** snapshot.controllerType must be converted to strategyType before dispatcher
4. **#10** must be after #8 - fill routing must be closed-loop first
