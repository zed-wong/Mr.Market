# Split strategy.service.ts into Multiple Services

**Status**: Not started  
**File**: `server/src/modules/market-making/strategy/strategy.service.ts` (5779 lines)  
**Goal**: Break into ~6 focused services while keeping StrategyService as a thin facade

---

## Overview

`strategy.service.ts` handles 5 strategy types plus lifecycle, session management, fills, balances, and shared helpers — all in one 5779-line file. The split creates per-strategy-type services while StrategyService remains the public API facade that controllers and external consumers reference.

### Target Architecture

```
strategy.service.ts              (~1500 lines) — Facade: lifecycle, sessions, routing, shared helpers
strategy-dual-account.service.ts (~1200 lines) — Dual-account volume logic
strategy-pmm.service.ts          (~800 lines)  — Pure market making logic
strategy-volume.service.ts       (~400 lines)  — Volume strategy logic
strategy-arbitrage.service.ts    (~300 lines)  — Arbitrage logic
strategy-time-indicator.service.ts (~350 lines) — Time indicator logic
config/strategy-params.types.ts  (exists)       — Shared types
```

### External Consumers (must NOT change)

These all import `StrategyService` — its public API must stay identical:
- Controllers: `arbitrage-strategy.controller.ts`, `pure-market-making-strategy.controller.ts`, `dual-account-volume-strategy.controller.ts`, `volume-strategy.controller.ts`, `time-indicator-strategy.controller.ts`
- Services: `strategy-runtime-dispatcher.service.ts`, `alpacastrat.service.ts`
- External modules: `market-making-runtime`, `pause-withdraw-orchestrator`

Controllers call StrategyService methods via a passed `service: StrategyService` parameter in `decideActions`/`onActionsPublished`/`rerun`. The public method signatures on StrategyService must not change.

---

## Already Done (prior threads)

- **Created `config/strategy-params.types.ts`** with all extracted types: `BaseVolumeStrategyParams`, `CexVolumeStrategyParams`, `AmmDexVolumeStrategyParams`, `VolumeStrategyParams`, `DualAccountVolumeStrategyParams`, `DualAccountBehaviorProfile`, `DualAccountPairBalances`, `DualAccountResolvedAccounts`, `DualAccountExecutionPlan`, `DualAccountTradeabilityPlan`, `DualAccountRebalanceCandidate`, `DualAccountBalanceSnapshot`, `PooledExecutorTarget`, `ConnectorHealthStatus`
- These types are currently **duplicated** — defined inline in `strategy.service.ts` (lines 63–184) AND in the types file. The inline copies need to be removed and replaced with imports.

---

## Method Inventory (all 100+ methods in strategy.service.ts)

### Group A: Lifecycle & Session Management (~1500 lines, STAYS in StrategyService)

These methods manage the `sessions` Map, executor lifecycle, tick routing, fills, balance watchers, and strategy stop/start. They form the core of StrategyService and stay.

| Method | Line | Notes |
|--------|------|-------|
| `generateRunId` | 212 | |
| `onModuleInit` | 255 | |
| `onModuleDestroy` | 266 | |
| `start` | 272 | |
| `stop` | 281 | |
| `onApplicationShutdown` | 288 | |
| `health` | 292 | |
| `onTick` | 300 | |
| `routeFillForExchangePair` | 304 | |
| `onTickForPooledExecutors` | 331 | |
| `getRunningStrategies` | 350 | |
| `getAllStrategies` | 375 | |
| `getStrategyInstanceKey` | 389 | |
| `isStrategyRuntimeEligible` | 395 | |
| `rerunStrategy` | 415 | |
| `stopStrategyForUser` | 708 | |
| `stopMarketMakingStrategyForOrder` | 772 | |
| `linkDefinitionToStrategyInstance` | 786 | |
| `checkAndCleanFilledOrders` | 952 | |
| `upsertSession` | 964 | |
| `restoreOrQueueStrategy` | 1062 | |
| `canActivateStrategyImmediately` | 1078 | |
| `activatePendingStrategiesForExchange` | 1101 | |
| `activateStrategyFromPersistence` | 1160 | |
| `upsertStrategyInstance` | 1181 | |
| `fetchStartPrice` | 1222 | |
| `getCadenceMs` | 1270 | |
| `runSession` | 1286 | |
| `isSameActiveSession` | 1420 | |
| `publishIntents` | 3417 | |
| `persistStrategyParams` | 3660 | |
| `removeSession` | 3955 | |
| `cancelTrackedOrdersForStrategy` | 3966 | |
| `detachSessionFromExecutor` | 4010 | |
| `resolvePooledExecutorTarget` | 4060 | |
| `resolveAccountLabel` | 4115 | |
| `resolveRequiredAccountLabels` | 4140 | |
| `startPrivateOrderWatcher` | 4157 | |
| `startBalanceWatchers` | 4179 | |
| `stopBalanceWatchers` | 4205 | |
| `stopPrivateOrderWatcher` | 4231 | |
| `logSessionTickError` | 4253 | |
| `handleSessionFill` | 4280 | |
| `applyFillToBalanceLedger` | 4325 | |
| `buildFillLedgerEventKey` | 4405 | |
| `estimateMakerFeeSpread` | 4431 | |
| `setConnectorHealthStatus` | 4445 | |
| `restoreRuntimeStateForStrategy` | 4818 | Dispatches to per-type restore |
| `cancelAllRunningStrategies` | 4971 | |

### Group B: Shared Helpers (~400 lines, STAYS in StrategyService, DUPLICATED into sub-services as needed)

| Method | Line | Used by |
|--------|------|---------|
| `createIntent` | 3377 | All strategies |
| `getPriceSource` | 3447 | PMM, Arbitrage |
| `resolveVolumeSide` | 3506 | Volume, DualAccount |
| `getAvailableBalancesForPair` | 4470 | PMM, DualAccount |
| `quantizeAndValidateQuote` | 4534 | PMM, DualAccount (~180 lines) |
| `getCancelableTrackedOrders` | 5000 | DualAccount, PMM, lifecycle |
| `waitForTrackedOrdersToSettle` | 5015 | DualAccount, PMM, lifecycle |
| `forceTrackedOrdersTerminal` | 5075 | Lifecycle |
| `isTrackedOrderTerminal` | 5295 | Multiple |
| `normalizeExchangeOrderStatus` | 5301 | Multiple |
| `parseBaseQuote` | 5409 | Balance helpers |
| `readString` | 5446 | Multiple |
| `applyVariance` | 5626 | Volume, DualAccount |
| `readPositiveNumber` | 5655 | Multiple |
| `readNonNegativeNumber` | 5661 | Multiple |
| `readUnitIntervalNumber` | 5667 | Multiple |
| `sleep` | 5371 | Multiple |
| `toErrorDetails` | 5685 | Multiple |

### Group C: Dual-Account Volume (~1200 lines → `strategy-dual-account.service.ts`)

**Session-aware wrappers** (STAY in StrategyService, delegate heavy work):
| Method | Line | Why stays |
|--------|------|-----------|
| `executeDualAccountVolumeStrategy` | 625 | Calls `upsertSession`, `upsertStrategyInstance` |
| `buildDualAccountVolumeSessionActions` | 1520 | Accesses `this.sessions`, `isSameActiveSession`, `stopStrategyForUser` |
| `onDualAccountVolumeActionsPublished` | 1602 | Accesses `this.sessions`, `persistStrategyParams` |

**MOVE to `StrategyDualAccountService`** (26 methods):
| # | Method | Line | New visibility |
|---|--------|------|---------------|
| 1 | `isDualAccountRebalanceAction` | 1665 | public |
| 2 | `buildDualAccountVolumeActions` | 1675 | public |
| 3 | `resolveDualAccountCycleAccounts` | 1866 | private |
| 4 | `resolveDualAccountCycleAccountsFromBalances` | 1901 | private |
| 5 | `computeDualAccountCapacity` | 1954 | private |
| 6 | `resolveDualAccountExecutionPlan` | 1991 | private |
| 7 | `maybeBuildDualAccountRebalanceAction` | 2056 | private |
| 8 | `buildDualAccountRebalanceCandidate` | 2168 | private |
| 9 | `resolveBestDualAccountTradeabilityFromBalances` | 2291 | private |
| 10 | `evaluateDualAccountTradeabilityForSideFromBalances` | 2323 | private |
| 11 | `cloneDualAccountPairBalances` | 2362 | private |
| 12 | `evaluateDualAccountExecutionForSide` | 2373 | private |
| 13 | `quantizeAndAdaptDualAccountQuote` | 2456 | private (~220 lines) |
| 14 | `resolveDualAccountFeeBufferRate` | 2677 | private |
| 15 | `loadDualAccountBalanceSnapshot` | 2711 | private |
| 16 | `resolveDualAccountPreferredSide` | 2750 | public |
| 17 | `resolveInventoryReferencePrice` | 2799 | private |
| 18 | `normalizeDualAccountMakerPrice` | 2829 | private |
| 19 | `isDualAccountMakerPriceValid` | 2894 | private |
| 20 | `restoreDualAccountVolumeRuntimeState` | 4770 | public |
| 21 | `mergeDualAccountConfigIntoRuntime` | 5458 | public |
| 22 | `resolveNextDualAccountCadenceMs` | 5561 | public |
| 23 | `resolveDualAccountMakerDelayMs` | 5572 | private |
| 24 | `resolveDualAccountBehaviorProfile` | 5589 | private |
| 25 | `normalizeBehaviorProfile` | 5609 | private |
| 26 | `isWithinDualAccountProfileWindow` | 5675 | private |

**Duplicated helpers needed**: `createIntent`, `resolveVolumeSide`, `getAvailableBalancesForPair`, `quantizeAndValidateQuote`, `parseBaseQuote`, `readString`, `applyVariance`, `readPositiveNumber`, `readNonNegativeNumber`, `readUnitIntervalNumber`, `getCancelableTrackedOrders`, `waitForTrackedOrdersToSettle`, `isTrackedOrderTerminal`, `normalizeExchangeOrderStatus`, `sleep`

**Constructor dependencies**:
```typescript
@InjectRepository(StrategyInstance) strategyInstanceRepository: Repository<StrategyInstance>,
@Optional() exchangeOrderTrackerService?: ExchangeOrderTrackerService,
@Optional() strategyMarketDataProviderService?: StrategyMarketDataProviderService,
@Optional() exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
@Optional() userStreamIngestionService?: UserStreamIngestionService,
@Optional() balanceStateCacheService?: BalanceStateCacheService,
@Optional() balanceStateRefreshService?: BalanceStateRefreshService,
```

**Delegation in StrategyService**:
- `buildDualAccountVolumeSessionActions` → calls `this.strategyDualAccountService.buildDualAccountVolumeActions(...)`, `.mergeDualAccountConfigIntoRuntime(...)`, `.resolveNextDualAccountCadenceMs(...)`
- `onDualAccountVolumeActionsPublished` → calls `.isDualAccountRebalanceAction(...)`, `.mergeDualAccountConfigIntoRuntime(...)`, `.resolveNextDualAccountCadenceMs(...)`
- `restoreRuntimeStateForStrategy` → calls `.restoreDualAccountVolumeRuntimeState(...)`

**Call graph**:
```
Controller.decideActions(session, ts, service)
  → service.buildDualAccountVolumeSessionActions(session, ts)     [StrategyService]
    → dualAccountService.mergeDualAccountConfigIntoRuntime(...)
    → dualAccountService.resolveNextDualAccountCadenceMs(...)
    → this.getCancelableTrackedOrders(...)                        [shared helper]
    → dualAccountService.buildDualAccountVolumeActions(...)
      → .resolveDualAccountFeeBufferRate(...)
      → .resolveDualAccountPreferredSide(...)
      → .loadDualAccountBalanceSnapshot(...)
      → .resolveDualAccountExecutionPlan(...)
        → .evaluateDualAccountExecutionForSide(...)
          → .resolveDualAccountCycleAccounts(...)
          → .resolveDualAccountBehaviorProfile(...)
          → .quantizeAndAdaptDualAccountQuote(...)
            → .normalizeDualAccountMakerPrice(...)
            → .computeDualAccountCapacity(...)
      → .maybeBuildDualAccountRebalanceAction(...)
        → .buildDualAccountRebalanceCandidate(...)
      → .createIntent(...)
```

### Group D: Pure Market Making (~800 lines → `strategy-pmm.service.ts`)

**Session-aware wrappers** (STAY in StrategyService):
| Method | Line | Why stays |
|--------|------|-----------|
| `executePureMarketMakingStrategy` | 470 | Calls `upsertSession`, `upsertStrategyInstance` |
| `executeMMCycle` | 510 | Calls `upsertSession` |

**MOVE to `StrategyPmmService`**:
| Method | Line | New visibility |
|--------|------|---------------|
| `buildPureMarketMakingActions` | 2909 | public (~320 lines) |
| `buildLegacyQuotes` | 3230 | private |
| `isQuoteWithinTolerance` | 3297 | private |
| `buildCancelOrderAction` | 3323 | private |
| `appendCancelAction` | 3361 | private |
| `buildStaleOrderActions` | 4717 | private |
| `shouldTriggerKillSwitch` | 5090 | private |
| `recordSessionPnL` | 5138 | private |
| `isOrderOwnedByStrategy` | 5209 | private |
| `cancelRecoveredExchangeOrder` | 5248 | private |
| `parseKillSwitchAbsoluteThreshold` | 5333 | private |
| `parseKillSwitchPercentThreshold` | 5349 | private |
| `safePct` | 5771 | private |

**Duplicated helpers needed**: `createIntent`, `getPriceSource`, `getAvailableBalancesForPair`, `quantizeAndValidateQuote`, `parseBaseQuote`, `readString`, `getCancelableTrackedOrders`, `isTrackedOrderTerminal`, `normalizeExchangeOrderStatus`, `toErrorDetails`

### Group E: Volume (~400 lines → `strategy-volume.service.ts`)

**Session-aware wrappers** (STAY in StrategyService):
| Method | Line |
|--------|------|
| `executeVolumeStrategy` | 534 |
| `buildVolumeSessionActions` | 1313 |
| `onVolumeActionsPublished` | 1380 |

**MOVE to `StrategyVolumeService`**:
| Method | Line | New visibility |
|--------|------|---------------|
| `buildVolumeActions` | 1433 | public |
| `computeAmmAmountIn` | 3526 | private |
| `buildClobVolumeParams` | 3551 | private |
| `buildAmmDexVolumeParams` | 3591 | private |

**Duplicated helpers needed**: `createIntent`, `resolveVolumeSide`, `getAvailableBalancesForPair`, `quantizeAndValidateQuote`, `parseBaseQuote`, `readString`, `applyVariance`, `readPositiveNumber`, `readNonNegativeNumber`, `readUnitIntervalNumber`

### Group F: Arbitrage (~300 lines → `strategy-arbitrage.service.ts`)

**Session-aware wrappers** (STAY in StrategyService):
| Method | Line |
|--------|------|
| `startArbitrageStrategyForUser` | 439 |
| `evaluateArbitrageOpportunityVWAP` | 932 |

**MOVE to `StrategyArbitrageService`**:
| Method | Line | New visibility |
|--------|------|---------------|
| `buildArbitrageActions` | 816 | public |
| `calculateVWAPForAmount` | 3463 | private |

**Duplicated helpers needed**: `createIntent`, `getPriceSource`

### Group G: Time Indicator (~350 lines → `strategy-time-indicator.service.ts`)

**Session-aware wrappers** (STAY in StrategyService):
| Method | Line |
|--------|------|
| `executeTimeIndicatorStrategy` | 3675 |

**MOVE to `StrategyTimeIndicatorService`**:
| Method | Line | New visibility |
|--------|------|---------------|
| `buildTimeIndicatorActions` | 3705 | public (~250 lines) |
| `isWithinTimeWindow` | 5375 | private |
| `fetchCandles` | 5388 | private |
| `calcEma` | 5693 | private |
| `calcRsi` | 5716 | private |
| `avg` | 5748 | private |
| `calcCross` | 5754 | private |

**Duplicated helpers needed**: `createIntent`, `toErrorDetails`

---

## Implementation Order

### Phase 1: Dual-Account (largest, most isolated)
1. Create `strategy-dual-account.service.ts` with 26 moved + 15 duplicated methods
2. Update `strategy.service.ts`: remove inline types (import from `strategy-params.types`), inject `StrategyDualAccountService`, delete moved methods, update wrappers to delegate
3. Add `StrategyDualAccountService` to `strategy.module.ts` providers
4. Update `strategy.service.spec.ts` for new injection
5. Run tests: `bun run test -- --testPathPattern="strategy" --no-coverage`

### Phase 2: Pure Market Making
1. Create `strategy-pmm.service.ts` with 13 moved methods
2. Update `strategy.service.ts` to delegate
3. Register in module, update tests

### Phase 3: Volume
1. Create `strategy-volume.service.ts` with 4 moved methods
2. Update `strategy.service.ts` to delegate
3. Register in module, update tests

### Phase 4: Arbitrage
1. Create `strategy-arbitrage.service.ts` with 2 moved methods
2. Update `strategy.service.ts` to delegate
3. Register in module, update tests

### Phase 5: Time Indicator
1. Create `strategy-time-indicator.service.ts` with 7 moved methods
2. Update `strategy.service.ts` to delegate
3. Register in module, update tests

### Phase 6: Cleanup
1. Remove remaining inline type definitions from strategy.service.ts
2. Consider extracting shared helpers into a `strategy-helpers.service.ts` to eliminate duplication (optional, lower priority)

---

## Verification

After each phase:
```bash
cd server && bun run test -- --testPathPattern="strategy.service" --no-coverage
cd server && bun run test -- --testPathPattern="strategy-runtime-architecture" --no-coverage
```

After all phases:
```bash
cd server && bun run test --no-coverage
```
