# Dynamic Strategy Architecture Transition Plan (Reuse-First Update)

## Goal
- Apply controller + orchestrator + executor architecture (Hummingbot style) with minimum risk.
- Keep strategy definitions dynamic in DB.
- Keep executors hardcoded and trusted.
- Reuse existing modules as much as possible, especially market data and intent pipeline.

## Reuse-First Principles
- Do not replace stable modules that already work.
- Add thin layers around existing modules before moving logic.
- Migrate one strategy controller at a time (pure MM -> arbitrage -> volume).
- Keep backward-compatible APIs during transition.
- Keep rollout reversible at every phase.

## Current Reusable Modules (Do Not Rewrite)
- Tick scheduler: `server/src/modules/market-making/tick/clock-tick-coordinator.service.ts`
- Runtime sessions + persistence: `server/src/modules/market-making/strategy/strategy.service.ts`
- Controller registry: `server/src/modules/market-making/strategy/controllers/strategy-controller.registry.ts`
- Intent transport:
  - `server/src/modules/market-making/strategy/config/strategy-intent.types.ts`
  - `server/src/modules/market-making/strategy/execution/strategy-intent-store.service.ts`
  - `server/src/modules/market-making/strategy/execution/strategy-intent-worker.service.ts`
  - `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`
- Exchange execution adapter: `server/src/modules/market-making/execution/exchange-connector-adapter.service.ts`
- DEX execution service: `server/src/modules/market-making/strategy/dex/dex-volume.strategy.service.ts`
- Trackers:
  - `server/src/modules/market-making/trackers/order-book-tracker.service.ts`
  - `server/src/modules/market-making/trackers/private-stream-tracker.service.ts`
  - `server/src/modules/market-making/trackers/exchange-order-tracker.service.ts`
- Market data module:
  - `server/src/modules/data/market-data/market-data.service.ts`
  - `server/src/modules/data/market-data/market-data.gateway.ts`
- DB definition/version model:
  - `server/src/common/entities/market-making/strategy-definition.entity.ts`
  - `server/src/common/entities/market-making/strategy-definition-version.entity.ts`
  - `server/src/common/entities/market-making/strategy-instances.entity.ts`

## Main Gaps
- Controllers are still thin wrappers; decision logic lives in `StrategyService`.
- Start/stop config and dispatch logic is duplicated in:
  - `server/src/modules/admin/strategy/adminStrategy.service.ts`
  - `server/src/modules/market-making/user-orders/market-making.processor.ts`
- DEX volume path can bypass intent pipeline.
- Naming inconsistency (`controllerType` vs `executorType`) creates drift.
- Potential runtime ownership issue: `StrategyService` is provided in both Admin and Strategy modules.

## Architecture Target
- Controller owns decision logic and emits `ExecutorAction[]`.
- `ExecutorOrchestratorService` is the single path from action -> intent/execution.
- `StrategyService` owns session lifecycle and scheduling only.
- `StrategyConfigResolverService` owns merge/normalize/validate.
- `StrategyMarketDataProviderService` reuses trackers + market data + connector adapter.

---

## Phase 0 - Baseline Lock (No Behavior Change)

### Tasks
- Add/extend regression tests for current behavior before refactor.

### Files
- `server/src/modules/market-making/strategy/strategy.service.spec.ts`
- `server/src/modules/admin/strategy/adminStrategy.service.spec.ts`
- `server/src/modules/market-making/user-orders/market-making.processor.spec.ts`

### Exit Criteria
- Current flow behavior is encoded in tests.
- Safe baseline exists for refactor.

---

## Phase 1 - Runtime Ownership and Module Boundaries

### Tasks
- Ensure one authoritative runtime `StrategyService` instance.
- Remove duplicate provider ownership pattern.
- Break module coupling to avoid duplicated in-memory session maps.

### Files
- `server/src/modules/admin/admin.module.ts`
- `server/src/modules/market-making/strategy/strategy.module.ts`
- `server/src/modules/market-making/strategy/controllers/*`
- `server/src/modules/admin/admin.controller.ts` (if route movement is needed)

### Notes
- If needed, move `joinStrategy` endpoint dependency so Strategy module no longer depends on Admin module.
- Prefer importing Strategy module from Admin side rather than duplicating StrategyService provider.

### Exit Criteria
- Single runtime owner for strategy sessions.
- No duplicate `StrategyService` instantiation path.

---

## Phase 2 - Shared Config Resolver and Runtime Dispatcher

### Tasks
- Add `StrategyConfigResolverService`:
  - merge `defaultConfig + overrides + runtime identity`
  - normalize aliases (e.g. volume field aliases)
  - validate against config schema
- Add `StrategyRuntimeDispatcherService`:
  - one start path
  - one stop path
  - one strategy type mapping path

### Files (new)
- `server/src/modules/market-making/strategy/dex/strategy-config-resolver.service.ts`
- `server/src/modules/market-making/strategy/execution/strategy-runtime-dispatcher.service.ts`

### Files (modify)
- `server/src/modules/admin/strategy/adminStrategy.service.ts`
- `server/src/modules/market-making/user-orders/market-making.processor.ts`
- `server/src/modules/market-making/strategy/strategy.module.ts`

### Exit Criteria
- Admin start/stop and queue `start_mm`/`stop_mm` use shared resolver + dispatcher.
- Remove duplicated `toStrategyType/getStrategyTypeFromControllerType` branches.

---

## Phase 3 - Introduce Orchestrator (Adapter Mode, Reuse Existing Intents)

### Tasks
- Add `ExecutorAction` model.
- Add `ExecutorOrchestratorService` that maps actions to existing `StrategyOrderIntent` and writes via `StrategyIntentStoreService`.
- Keep worker/execution services unchanged in this phase.

### Files (new)
- `server/src/modules/market-making/strategy/config/executor-action.types.ts`
- `server/src/modules/market-making/strategy/intent/executor-orchestrator.service.ts`
- `server/src/modules/market-making/strategy/intent/executor-orchestrator.service.spec.ts`

### Files (modify)
- `server/src/modules/market-making/strategy/config/strategy-intent.types.ts` (if action mapping needs expansion)
- `server/src/modules/market-making/strategy/strategy.module.ts`

### Exit Criteria
- Action dispatch path exists and reuses current intent pipeline.
- No exchange execution logic duplicated in orchestrator.

---

## Phase 4 - Market Data Provider (Reuse Existing Modules)

### Tasks
- Add `StrategyMarketDataProviderService` with layered data source order:
  1. `OrderBookTrackerService` (fast local state)
  2. `ExchangeConnectorAdapterService.fetchOrderBook` (poll fallback)
  3. `MarketdataService.getTickerPrice` (ticker fallback)
- Keep direct exchange calls only as last-resort compatibility, then remove gradually.

### Files (new)
- `server/src/modules/market-making/strategy/data/strategy-market-data-provider.service.ts`
- `server/src/modules/market-making/strategy/data/strategy-market-data-provider.service.spec.ts`

### Files (modify)
- `server/src/modules/market-making/strategy/strategy.module.ts` (import `MarketdataModule`)
- `server/src/modules/market-making/strategy/strategy.service.ts`
- `server/src/modules/market-making/strategy/controllers/pure-market-making-strategy.controller.ts`
- `server/src/modules/market-making/strategy/controllers/arbitrage-strategy.controller.ts`
- `server/src/modules/market-making/strategy/controllers/volume-strategy.controller.ts`

### Optional Follow-up (Phase 4b)
- Add background ingestion to feed `OrderBookTrackerService` from existing market data streams.
- This is optional and can be deferred after controller migration.

### Exit Criteria
- Controllers fetch market data through provider abstraction.
- Existing market-data/tracker modules are reused, not replaced.

---

## Phase 5 - Move Decision Logic from StrategyService to Controllers

### Pure Market Making
- Move quote and signal decision path from `StrategyService` to controller.
- Reuse `QuoteExecutorManagerService` for quote generation.

### Arbitrage
- Move profitability/signal logic from `StrategyService` to controller.

### Volume
- Move cycle decision logic into controller.
- Keep lifecycle counters in strategy runtime state, not in definition defaults.

### Files
- `server/src/modules/market-making/strategy/controllers/pure-market-making-strategy.controller.ts`
- `server/src/modules/market-making/strategy/controllers/arbitrage-strategy.controller.ts`
- `server/src/modules/market-making/strategy/controllers/volume-strategy.controller.ts`
- `server/src/modules/market-making/strategy/strategy.service.ts`
- `server/src/modules/market-making/strategy/config/strategy-controller.types.ts`

### Exit Criteria
- Controllers emit actions.
- `StrategyService` is scheduler/lifecycle-focused.

---

## Phase 6 - Executor Category Refactor (CLOB CEX / CLOB DEX / AMM DEX)

### Goal
- Standardize executor routing by execution category:
  - CLOB CEX: centralized order book exchanges (Binance, Coinbase, Kraken)
  - CLOB DEX: decentralized order book venues (e.g. dYdX)
  - AMM DEX: AMM swap protocols via gateway/adapter (Uniswap, PancakeSwap)

### Why this phase
- Current code routes with `executionVenue: 'cex' | 'dex'`, which is too coarse.
- DEX path currently maps to AMM only (`uniswapV3`, `pancakeV3`).
- CLOB DEX is not first-class today; we need a category contract now so we can add it safely.

### Reuse Existing Components
- Keep and reuse:
  - `ExchangeConnectorAdapterService` for CLOB-style order APIs.
  - `DexVolumeStrategyService` and `DexAdapterRegistry` for AMM swaps.
  - Intent pipeline (`StrategyIntentStoreService`, worker, execution service).
- Do not rewrite exchange init, tick scheduler, or DB definition model in this phase.

### New Category Model
- Add category enum/type in strategy domain:
  - `clob_cex`
  - `clob_dex`
  - `amm_dex`
- Keep backward compatibility:
  - map old `executionVenue='cex'` -> `clob_cex`
  - map old `executionVenue='dex'` -> `amm_dex` (default)

### Executor Routing Rules
- `clob_cex`:
  - place/cancel/fetch through `ExchangeConnectorAdapterService`.
  - uses order intents (`CREATE_LIMIT_ORDER`, `CANCEL_ORDER`, `STOP_EXECUTOR`).
- `clob_dex`:
  - same action model as CLOB CEX, but connector is a DEX CLOB connector adapter.
  - start as `not implemented` route with explicit error until adapter exists.
- `amm_dex`:
  - action route calls `DexVolumeStrategyService` (or AMM executor service) behind orchestrator.
  - keep current uniswap/pancake adapter logic.

### Required Changes (Minimal Surface)
- Update DTO/domain types:
- `server/src/modules/market-making/strategy/config/strategy.dto.ts`
  - replace/extend `VolumeExecutionVenue` to include category naming.
- Add execution category resolver:
  - new helper/service in strategy module to resolve legacy payloads.
- Update runtime params builder:
  - `server/src/modules/market-making/strategy/strategy.service.ts`
  - store normalized `executionCategory` in session params.
- Update intent execution routing:
  - `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`
  - route by execution category.
- Keep `DexVolumeStrategyService` unchanged except call-site contract updates.
- Update admin and processor path compatibility:
  - `server/src/modules/admin/strategy/adminStrategy.service.ts`
  - `server/src/modules/market-making/user-orders/market-making.processor.ts`
  - ensure old config still works via normalization.

### API Compatibility
- Preserve existing request payloads.
- Accept old fields and normalize server-side.
- Return normalized category in debug/instance metadata responses where useful.

### Current Capability vs Category
- Supported now:
  - CLOB CEX: yes
  - AMM DEX: yes
- Planned extension:
  - CLOB DEX: contract and routing placeholder in this phase, adapter integration in follow-up.

### Tests
- Unit:
  - category normalization (`cex` -> `clob_cex`, `dex` -> `amm_dex`)
  - category-based routing behavior
  - unsupported `clob_dex` returns explicit controlled error
- Integration:
  - volume strategy start with legacy and new category payloads
  - CLOB CEX path still emits/executed intents
  - AMM DEX path still executes swap cycle as before

### Exit Criteria
- Executor routing is category-based, not binary venue-based.
- Legacy payloads remain functional.
- CLOB CEX and AMM DEX behavior unchanged from user perspective.
- CLOB DEX has explicit extension point (no hidden fallback).

---

## Phase 7 - Definition Lifecycle and Naming Cleanup

### Tasks
- Add remove definition endpoint with guards:
  - must be disabled first
  - block if linked strategy instances exist
- Keep backward-compatible alias but make one canonical name across BE/FE.

### Files (backend)
- `server/src/modules/admin/admin.controller.ts`
- `server/src/modules/admin/strategy/adminStrategy.service.ts`
- `server/src/modules/admin/strategy/admin-strategy.dto.ts`

### Files (frontend)
- `interface/src/lib/types/hufi/strategy-definition.ts`
- `interface/src/lib/helpers/mrm/admin/strategy.ts`
- `interface/src/lib/helpers/mrm/admin/strategy.test.ts`
- `interface/src/routes/(bottomNav)/(admin)/manage/settings/strategies/+page.svelte`
- `interface/src/i18n/en.json`

### Exit Criteria
- Admin can add/update/publish/enable/disable/remove definitions safely.
- BE/FE naming is consistent with compatibility alias preserved.

---

## Phase 8 - Remove Legacy Runtime Branches

### Tasks
- Remove fallback strategy type branches from `StrategyService`.
- Keep temporary compatibility wrappers only where needed.
- Gradually deprecate direct strategy execute endpoints once callers migrate.

### Files
- `server/src/modules/market-making/strategy/strategy.service.ts`
- `server/src/modules/market-making/strategy/controllers/*`
- `server/src/modules/admin/strategy/adminStrategy.service.ts`

### Exit Criteria
- Controller + orchestrator flow is the primary and only runtime path.

---

## Testing Plan
- Unit:
  - config resolver merge/normalize/validate
  - market data provider source fallback order
  - controller action emission
  - orchestrator action->intent mapping
- Integration:
  - admin validate/start/stop from definitions
  - queue `start_mm` path using same dispatcher
  - intent lifecycle status transitions
  - DEX/CEX execution through orchestrator
- Regression:
  - keep existing strategy and worker tests green.

## Verification Commands
- Server:
  - `bun run test`
  - `bun run lint`
  - `bun run build`
- Interface:
  - `bun run test:unit`
  - `bun run check`
  - `bun run lint`

## Rollout Plan
1. PR1: baseline tests + module boundary fix
2. PR2: config resolver + runtime dispatcher
3. PR3: orchestrator adapter + pure MM migration
4. PR4: arbitrage + volume migration
5. PR5: DEX orchestration path and executor category routing
6. PR6: definition remove + BE/FE naming cleanup
7. PR7: legacy branch cleanup + final docs

## Rollback
- Each phase should be independently revertible.
- Keep legacy API compatibility until final cleanup phase.
- Do not remove compatibility fields/routes before client migration confirms done.

## Done Definition
- Controllers decide.
- Orchestrator dispatches.
- Executors execute.
- Strategy configs remain DB-backed and versioned.
- Runtime uses shared dispatcher and config resolver.
- Market data provider reuses existing market-data and trackers modules.
- No duplicated start/stop branches remain.
- Docs and changelog are updated.

## Docs To Update During Implementation
- `docs/execution/flow/MARKET_MAKING_FLOW.md`
- `docs/execution/CHANGELOG.md`

## Decision to Confirm Before Implementation
1. Polling-first market data (recommended): use tracker -> fetchOrderBook fallback now, add stream ingestion later.
2. Streaming-first market data: build active session subscriptions into tracker in first iteration (more scope/risk).
