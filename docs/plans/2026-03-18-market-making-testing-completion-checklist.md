# Market-Making Testing Completion Checklist

## Overview

This document summarizes the current test coverage and the remaining gaps based on a review of the tests under `server/test/system`.

**Generated on:** 2026-03-18

## Current Test Coverage

### Test File Overview

```text
server/test/system/
├── helpers/                          # Test helpers (7 files)
├── app/
│   └── app-info.system.spec.ts       # App info test
├── database/
│   └── migration-seed.system.spec.ts # Database migration/seed test
└── market-making/
    ├── user-orders/                  # 2 tests
    │   ├── market-making-payment-intake.system.spec.ts
    │   └── market-making.processor.system.spec.ts
    │
    ├── strategy/                     # 9 tests
    │   ├── pure-market-making-single-tick.system.spec.ts
    │   ├── pure-market-making-multi-layer.system.spec.ts
    │   └── pure-market-making-cadence.system.spec.ts
    │   ├── pure-market-making-intent-lifecycle.system.spec.ts
    │   ├── pure-market-making-intent-retry.system.spec.ts
    │   ├── pure-market-making-intent-failure.system.spec.ts
    │   ├── pure-market-making-intent-idempotency.system.spec.ts
    │   └── pure-market-making-intent-worker-error.system.spec.ts
    │
    └── execution/                    # 4 tests
        ├── private-partial-fill-ingestion.system.spec.ts
        ├── private-fill-ingestion.system.spec.ts
        ├── sandbox-fill-resolution.system.spec.ts
        └── sandbox-order-lifecycle.system.spec.ts
```

### Test Categories

| Category | Test Count | Scope |
|------|--------|------|
| App | 1 | Application info |
| Database | 1 | Database migrations and seeds |
| Market Making - User Orders | 2 | User-order handling and payment intake |
| Market Making - Strategy | 9 | Strategy behavior plus intent lifecycle, retry, failure, idempotency, and worker error handling |
| Market Making - Execution | 4 | Fill ingestion, partial-fill ingestion, fill resolution, and order lifecycle |

---

## Key Findings

### 1. Missing `onFill` Handler

**Finding:** The PureMarketMaking strategy does not register an `onFill` handler when it starts.

**Code location:** `server/src/modules/market-making/strategy/strategy.service.ts:713-740`

```typescript
const executor = this.executorRegistry.getOrCreateExecutor(
  pooledTarget.exchange,
  pooledTarget.pair,
  {
    onTick: async (session, ts) => { ... },
    onTickError: async (session, error, ts) => { ... },
    // Missing onFill handler
    onFillError: async (session, error, fill) => { ... },
  },
);
```

**Impact:** Fills can be ingested, but there is no downstream processing path after receipt.

### 2. `BalanceLedgerService` Is Not Integrated

**Finding:** `BalanceLedgerService` exists, but the fill-processing path does not call it.

**Impact:** Post-fill balance updates cannot be applied through the current runtime flow.

---

## Remaining Work

### Task List

| # | Task | Description | Priority | Status |
|---|------|------|--------|------|
| #1 | Implement PureMarketMaking `onFill` handler | Register `onFill` to process fills after ingestion, including balance updates and optional requoting | High | Completed |
| #2 | Add a full intent-lifecycle system test | Validate the full end-to-end flow: build -> publish -> consume -> fill | Medium | Completed |
| #3 | Add error-handling and retry system tests | Cover network timeouts, API errors, partial fills, and duplicate intents | Medium | Completed |
| #4 | Integrate `BalanceLedgerService` | Call `BalanceLedgerService` from `onFill` to update user balances | High | Completed |
| #5 | Add DEX integration system tests | Cover DEX quote sourcing and execution | Low | Pending |
| #6 | Add a closed-loop funding e2e test (testnet) | Validate deposit -> market making -> fill -> balance verification on testnet | Low | Blocked |

---

## Detailed Task Notes

### #1: Implement PureMarketMaking `onFill` Handler

**Goal:** Add an `onFill` handler to the `getOrCreateExecutor` call in `strategy.service.ts`.

**Expected behavior:**
1. Receive fill events
2. Update local position and balance state
3. Trigger requoting if needed

**Code location:** `server/src/modules/market-making/strategy/strategy.service.ts`

---

### #2: Add a Full Intent-Lifecycle System Test

**Goal:** Create a test that validates the full intent lifecycle.

**Test flow:**
1. `buildPureMarketMakingActions` generates actions
2. `publishIntents` sends them to `ExecutorOrchestrator`
3. `consumeIntents` executes the intents
4. Verify `IntentStore` state transitions (`NEW -> SENT -> DONE`)
5. Verify `ExecutionHistory` records

**Code location:** `server/test/system/market-making/strategy/`

---

### #3: Add Error-Handling and Retry System Tests

**Goal:** Simulate failure scenarios and validate runtime robustness.

**Test scenarios:**
1. Network timeouts: verify retry behavior (`maxRetries`, `retryBaseDelayMs`) - Completed via in-memory intent retry coverage
2. Exchange API errors: verify error handling and logging - Completed for worker error logging and FAILED status propagation
3. Partial fills: verify state updates - Completed for deterministic private-stream `partially_filled` ingestion
4. Duplicate intents: verify idempotency - Completed via repeated real execution-service consume coverage

**Code location:** `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`

---

### #4: Integrate `BalanceLedgerService`

**Goal:** Call `BalanceLedgerService` from the `onFill` handler.

**Expected behavior:**
1. Record base-asset changes
2. Record quote-asset changes
3. Support querying the current position

**Dependency:** Task #1

---

### #5: Add DEX Integration System Tests

**Goal:** Test DEX-related functionality.

**Test scenarios:**
1. DEX quote retrieval (`EXECUTE_AMM_SWAP` intent type)
2. DEX AMM swap execution
3. DEX failure fallback behavior

**Dependency:** Requires a real DEX test environment

---

### #6: Add a Closed-Loop Funding E2E Test (Testnet)

**Goal:** Validate the complete flow using testnet funds.

**Test flow:**
1. Deposit funds into the system
2. Create a market-making order
3. Wait for fills
4. Verify balance changes
5. Calculate PnL
6. Withdraw funds

**Current blocker:** The full payment-complete -> withdraw_to_exchange -> withdrawal_confirmed -> deposit_confirming/deposit_confirmed -> join_campaign -> created/running path is not executable yet in the current runtime.

**Blocking gaps confirmed in code:**
1. `check_payment_complete` explicitly skips queueing `withdraw_to_exchange`
2. `handleWithdrawToExchange` is still in validation mode and refunds instead of sending funds to the exchange
3. the broader exchange-deposit confirmation path is not wired into a production-ready testable closed loop yet

**Note:** This remains the final task because it only becomes meaningful after the earlier tasks are complete and the withdrawal/deposit runtime path is enabled end to end.

---

## Execution Guidance

### Recommended Order

```text
Phase 1: Core runtime fixes
  #1 (onFill handler) -> #4 (BalanceLedgerService)

Phase 2: Coverage expansion
  #2 (intent lifecycle)
  #3 (error handling)

Phase 3: Extended integration coverage
  #5 (DEX integration)

Phase 4: End-to-end validation
  #6 (testnet funding loop)
```

### Risk Assessment

| Phase | Risk | Mitigation |
|------|------|----------|
| #1, #4 | High | Validate in sandbox first |
| #2, #3 | Medium | Use mocks to isolate external dependencies where appropriate |
| #5 | Low | Requires additional environment setup |
| #6 | Medium | Use small testnet balances |

---

## Related Documents

- `docs/plans/2026-03-18-market-making-testing-roadmap.md` - Testing roadmap
- `docs/plans/2026-03-15-ccxt-sandbox-integration-testing-plan.md` - Sandbox integration testing plan
- `docs/plans/2026-03-12-complete-market-making-cycle-design.en.md` - Complete market-making cycle design
