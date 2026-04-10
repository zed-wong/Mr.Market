# Dual Account Volume Strategy Implementation Plan

## Status

This is a revised plan. The previous draft identified the right product direction but missed several blocking gaps in the current runtime and persistence model.

## Goal

Implement a new strategy named `dual-account-volume-strategy` as a distinct strategy type that reproduces the old HuFi-style paired execution flow on a centralized exchange, while preserving the existing `volume` strategy as the current single-account / AMM-oriented implementation.

## Summary

The current codebase already has a strategy runtime, session scheduler, dispatcher, intent pipeline, private-stream ingestion, and direct admin market-making entrypoints. The missing piece is not just a new controller. The current execution chain is still single-account at critical layers:

- exchange connector adapter methods route to `getExchange(exchangeName)` without account label
- limit-order execution only forwards `postOnly`, not `timeInForce`
- startup activation checks only one account label
- tracked orders do not persist account ownership
- admin direct DTOs and `MarketMakingOrder` only model one API key binding

This plan introduces `dualAccountVolume` as a new internal `controllerType` and strategy type, and explicitly closes those gaps.

## Desired Behavior

The new strategy should:

- run on one centralized exchange
- use two separate exchange accounts / API key labels on that exchange
- place a maker `postOnly` order from one account
- wait a short configurable delay after maker acceptance
- place a matching taker `IOC` order from the other account
- repeat on a configurable interval until `completedCycles` reaches `numTrades`
- stop cleanly and cancel any tracked open orders when stopped
- recover safely after restart without losing account ownership boundaries
- integrate with the existing strategy instance, session, and intent execution architecture

## Why a New Strategy Type

The current `volume` strategy in this repository has different semantics:

- `clob_cex`: single-account periodic order generation
- `amm_dex`: single-wallet AMM swap execution
- `clob_dex`: explicitly not implemented

Reusing the existing `volume` type for dual-account paired execution would create ambiguity in runtime behavior, config shape, counter semantics, UI, and validation rules. A separate strategy type is cleaner and safer.

## Proposed Internal Naming

- display name: `Dual Account Volume Strategy`
- controller type: `dualAccountVolume`
- strategy type: `dualAccountVolume`
- planning / docs name: `dual-account-volume-strategy`

## Scope

### In Scope

- backend strategy type and controller registration
- runtime session support for dual-account paired execution
- intent and tracked-order support for account-specific routing
- centralized exchange execution using two account labels on the same exchange
- restart-safe maker/taker recovery rules
- automated tests for dispatch, config, action generation, execution routing, and restart behavior

### Explicitly Out of Scope for Initial Version

- regular user payment-based market-making flow integration
- frontend admin direct market-making integration
- admin direct DTO / entity support for dual API keys
- advanced randomization of amount or price bands
- campaign/reward reporting changes
- support for DEX execution
- fallback smart rebalancing between accounts
- auto-healing logic that replays a taker leg after process restart

## Key Design Decisions

### 1. Keep `dualAccountVolume` independent from `volume`

This strategy will not reuse `ExecuteVolumeStrategyDto`, `volume` counters, or `volume` action semantics. It gets its own DTO, params, controller, and completion rules.

### 2. Use explicit account fields across the execution chain

The execution chain must carry account ownership as first-class data, not best-effort metadata.

Required fields:

- strategy params:
  - `makerAccountLabel`
  - `takerAccountLabel`
- order intents:
  - `accountLabel`
  - `role: 'maker' | 'taker'`
  - `timeInForce?: 'IOC'`
- tracked orders:
  - `accountLabel`
  - `role: 'maker' | 'taker'`

### 3. Replace ambiguous `executedTrades` semantics

The existing `volume` strategy increments `executedTrades` when actions are published, not when a full maker+taker cycle actually completes.

For `dualAccountVolume`, define two counters:

- `publishedCycles`
  Used internally for idempotent cycle IDs and deterministic pricing progression.
- `completedCycles`
  Incremented only when a cycle reaches the success condition defined below.

Stopping rule:

- stop when `completedCycles >= numTrades`

### 4. Define cycle success strictly

For initial version, a cycle is considered complete only when:

- maker order was accepted by the exchange
- taker IOC order was submitted successfully
- resulting tracked/exchange state confirms that the taker leg is terminal

If maker placement fails:

- do not send taker
- cycle is not completed

If taker placement fails:

- attempt best-effort maker cancellation
- cycle is not completed

### 5. Define conservative restart behavior

After process restart, if a strategy is restored and an open maker order from a previously published cycle is found without a confirmed completed taker leg:

- do not attempt to infer and replay the missing taker leg
- cancel the dangling maker order best-effort
- mark the cycle as not completed
- allow the next scheduled cycle to rebuild from clean state

This avoids accidental duplicate self-trades after restart.

### 6. Keep exchange rate limiting shared by exchange for V1

The current adapter rate-limit chain is keyed by `exchangeName`, not `exchangeName + accountLabel`.

Decision for initial version:

- keep the shared per-exchange chain unchanged
- accept that maker and taker requests on the same exchange will be serialized through that chain

Reason:

- it matches current infrastructure behavior
- it minimizes risk of regressing existing strategies
- it can be revisited later if latency becomes a real operational issue

This plan must not claim parallel maker/taker submission.

### 7. Exclude admin direct support from V1

Current admin direct DTOs and `MarketMakingOrder` only support one `apiKeyId` binding. Extending that model is possible, but it adds entity, API, form, and resume/stop complexity that is not required to prove the runtime strategy.

Decision for initial version:

- do not wire `dualAccountVolume` into admin direct market-making
- keep this strategy available only through strategy definition / runtime execution paths that do not require a single `MarketMakingOrder.apiKeyId`

Admin direct can be a follow-up plan.

## Implementation Plan

### 1. Add a New Strategy Type

Update the strategy type system to include `dualAccountVolume`.

Files likely involved:

- `server/src/modules/market-making/strategy/config/strategy-controller.types.ts`
- `server/src/modules/market-making/strategy/execution/strategy-runtime-dispatcher.service.ts`
- `server/src/modules/market-making/strategy/controllers/strategy-controller.registry.ts`
- `server/src/modules/market-making/strategy/strategy.module.ts`

Changes:

- extend `StrategyType` with `dualAccountVolume`
- allow dispatcher mapping from `dualAccountVolume`
- register a dedicated controller for this strategy

### 2. Add DTOs and Runtime Config Shape

Define a dedicated DTO for the new strategy instead of reusing the current `volume` DTO.

Suggested fields:

- `exchangeName`
- `symbol`
- `baseTradeAmount`
- `baseIntervalTime`
- `numTrades`
- `baseIncrementPercentage`
- `pricePushRate`
- `postOnlySide?: 'buy' | 'sell'`
- `makerAccountLabel`
- `takerAccountLabel`
- `makerDelayMs`
- `userId`
- `clientId`

Runtime params:

- `exchangeName`
- `symbol`
- `baseTradeAmount`
- `baseIntervalTime`
- `numTrades`
- `baseIncrementPercentage`
- `pricePushRate`
- `postOnlySide`
- `makerAccountLabel`
- `takerAccountLabel`
- `makerDelayMs`
- `publishedCycles`
- `completedCycles`
- `lastCycleId?`
- `userId`
- `clientId`

Validation rules:

- both account labels must be present
- labels must be different
- both labels must be ready on the same exchange before activation
- `exchangeName` and `symbol` are required
- numeric values must be finite and positive where appropriate

Files likely involved:

- `server/src/modules/market-making/strategy/config/strategy.dto.ts`
- controller-specific config helpers
- strategy definition seed / template files if this strategy is exposed there

### 3. Add a Dedicated Strategy Service Entry Point

Create a dedicated entry point such as:

- `executeDualAccountVolumeStrategy(...)`

Responsibilities:

- build a strategy key using `dualAccountVolume`
- normalize and validate params
- upsert the strategy instance
- upsert the runtime session
- initialize `publishedCycles = 0`
- initialize `completedCycles = 0`

This should follow the same architecture as the existing runtime instead of using an internal timer loop.

Files likely involved:

- `server/src/modules/market-making/strategy/strategy.service.ts`

### 4. Add a Dedicated Controller

Create `DualAccountVolumeStrategyController` implementing `StrategyController`.

Responsibilities:

- define cadence from `baseIntervalTime`
- call a dedicated dual-account action builder
- persist `publishedCycles` only after the cycle intents are durably published
- update `completedCycles` only from execution/fill-side completion events, not from publish time

Files likely involved:

- `server/src/modules/market-making/strategy/controllers/dual-account-volume-strategy.controller.ts`

### 5. Add a Dedicated Action Builder

Add a new builder distinct from the existing single-account volume builder.

Suggested builder:

- `buildDualAccountVolumeSessionActions(...)`

The builder should:

1. stop the strategy when `completedCycles >= numTrades`
2. refuse to build a new cycle if there is any non-terminal tracked order for the same strategy
3. fetch best bid / ask
4. compute maker side and taker side
5. compute the target maker price from mid price, increment offset, and price push using `publishedCycles`
6. compute amount
7. emit the maker leg first with explicit account routing
8. emit enough cycle metadata so the taker leg can be scheduled after maker acceptance

Suggested cycle metadata:

- `cycleId`
- `cycleSequence`
- `makerAccountLabel`
- `takerAccountLabel`
- `makerDelayMs`

### 6. Extend the Intent Model for Account-Aware Execution

The current order intent shape is insufficient because it lacks first-class account and TIF fields.

Required changes:

- add `accountLabel?: string`
- add `timeInForce?: 'IOC'`
- keep `postOnly?: boolean`
- keep `metadata.role`

Recommended action model for V1:

- emit a maker `CREATE_LIMIT_ORDER` intent
- when maker is accepted, execution layer emits or schedules the taker `CREATE_LIMIT_ORDER` intent

Maker intent:

- `accountLabel = makerAccountLabel`
- `postOnly = true`
- `role = 'maker'`

Taker intent:

- `accountLabel = takerAccountLabel`
- `timeInForce = 'IOC'`
- `role = 'taker'`

Do not rely on arbitrary `metadata.accountLabel` lookups as the primary source of truth.

Files likely involved:

- `server/src/modules/market-making/strategy/config/strategy-intent.types.ts`
- `server/src/modules/market-making/strategy/execution/strategy-intent-store.service.ts`
- `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`

### 7. Extend Exchange Connector Adapter for Multi-Account Routing

This is the largest blocking gap in the current implementation.

Required changes:

- `placeLimitOrder(..., accountLabel?, options?)`
- `cancelOrder(..., accountLabel?)`
- `fetchOrder(..., accountLabel?)`
- any related helper using exchange precision or balances must accept account label when account-specific state matters

Routing behavior:

- maker leg uses `getExchange(exchangeName, makerAccountLabel)`
- taker leg uses `getExchange(exchangeName, takerAccountLabel)`

Execution options:

- maker: `postOnly: true`
- taker: `timeInForce: 'IOC'`

Files likely involved:

- `server/src/modules/market-making/execution/exchange-connector-adapter.service.ts`
- associated adapter tests

### 8. Add Multi-Account Readiness Checks

The current startup activation flow only checks one account label.

Required behavior for `dualAccountVolume`:

- `canActivateStrategyImmediately()` returns true only if both maker and taker labels are ready
- pending activation wakes only after both required labels for the same exchange become ready

Files likely involved:

- `server/src/modules/market-making/strategy/strategy.service.ts`
- related strategy service tests

### 9. Persist Account Ownership in Tracked Orders

`TrackedOrder` must become account-aware so stop cleanup, reconciliation, and restart restore can safely target the correct account.

Required additions:

- `accountLabel`
- `role?: 'maker' | 'taker'`
- optional `cycleId`

All reads and writes that call `fetchOrder()` or `cancelOrder()` against tracked orders must use `trackedOrder.accountLabel`.

Files likely involved:

- `server/src/common/entities/market-making/tracked-order.entity.ts`
- `server/src/modules/market-making/trackers/exchange-order-tracker.service.ts`
- reconciliation / cleanup paths in `strategy.service.ts`
- migration for the new columns

### 10. Add Sequencing Guarantees

The old implementation relies on strict sequencing:

1. place maker post-only order
2. wait a short delay after maker acceptance
3. place taker IOC order at the matching price

Required behavior:

- taker must not be sent before maker acceptance
- if maker placement fails, taker is never emitted
- if taker placement fails, attempt best-effort maker cancellation
- record the failure in execution history / logs

Recommended implementation:

- execution layer handles maker acceptance and then schedules the taker leg
- do not place both legs blindly in the same publish batch

This is more important than minimizing code volume.

### 11. Define Restart and Stop Semantics

On stop:

- cancel any non-terminal tracked orders using each order's own `accountLabel`
- wait for tracked orders to settle using account-aware `fetchOrder()`

On restart:

- restore persisted tracked orders
- if a non-terminal maker exists without evidence of a completed taker leg, cancel maker best-effort
- do not attempt taker replay for V1
- clear the strategy back to a clean next cycle

### 12. Frontend and Admin Direct

No frontend direct-start or admin direct support in V1.

If a UI or admin path later exposes this strategy, it must first add:

- dual API key selection
- dual account labels
- dual-account resume/stop validation
- a persistence model that does not overload single `apiKeyId`

That follow-up work is intentionally excluded from this plan.

## Price and Amount Logic

Initial implementation should remain simple and deterministic.

Suggested pricing logic:

- fetch `bestBid` and `bestAsk`
- compute `mid = (bestBid + bestAsk) / 2`
- compute `pushMultiplier = 1 + pricePushRate * publishedCycles / 100`
- compute `basePrice = mid * pushMultiplier`
- compute offset using `baseIncrementPercentage`
- for maker side:
  - buy: `basePrice * (1 - offset)`
  - sell: `basePrice * (1 + offset)`
- taker price should match the accepted maker price
- quantize price and amount using exchange precision helpers for the correct account/exchange client

Suggested amount logic:

- start with `baseTradeAmount`
- optionally reduce to fit available balances on both accounts
- reject cycle if amount drops below exchange minimum

Initial version should avoid unnecessary randomization.

## Testing Plan

Add tests for the following:

### Dispatcher / Mapping

- `dualAccountVolume` resolves to the new strategy type
- dispatcher starts the right strategy service method

### Strategy Service

- parameter validation
- session upsert
- dual-account readiness gating
- stop behavior after `completedCycles >= numTrades`
- correct side and pricing logic
- no new cycle while prior tracked orders remain non-terminal

### Action Generation

- maker leg is generated with correct account label and `postOnly`
- taker leg is only generated after maker acceptance
- `publishedCycles` and `completedCycles` follow the new semantics
- invalid amount cases are skipped safely

### Execution Layer

- maker routes to `makerAccountLabel`
- taker routes to `takerAccountLabel`
- `timeInForce = 'IOC'` is forwarded
- taker is not executed when maker fails
- maker cancellation is attempted when taker fails
- per-order cleanup uses tracked order account labels

### Tracking / Recovery

- tracked orders persist `accountLabel`
- restart cancels dangling maker without replaying taker
- startup reconciliation uses account-aware `fetchOrder()` and `cancelOrder()`

### Regression Coverage

- existing `volume` behavior remains unchanged
- existing `pureMarketMaking` behavior remains unchanged
- existing per-exchange rate-limit behavior remains unchanged

## Validation

Before completion, run the repository validators relevant to touched files:

- lint
- typecheck
- tests

Prefer scoped test runs during development, then run the required final validators before completion.

## Recommended Delivery Order

1. backend strategy type + dispatcher + DTOs
2. intent model changes for `accountLabel` and `timeInForce`
3. exchange connector adapter multi-account routing
4. tracked-order schema changes and account-aware cleanup/recovery
5. strategy service readiness gating and cycle counters
6. maker-accepted then taker-IOC sequencing
7. tests and validation

## Risks and Notes

- This strategy is operationally sensitive because it intentionally coordinates two accounts on one exchange.
- Account routing must be first-class and persisted; metadata-only routing is not sufficient.
- The initial version prioritizes deterministic behavior and restart safety over aggressiveness.
- The initial version intentionally keeps per-exchange rate limiting shared across accounts.
- Existing `volume` should remain available for single-account CEX / AMM use cases.

## Final Recommendation

Implement `dual-account-volume-strategy` as a fully separate strategy type with its own config shape, controller, counters, tracked-order schema, and execution semantics. Do not wire it into admin direct in V1. The first milestone is a correct multi-account runtime, not a broad surface-area rollout.
