# Dual Account Volume Strategy Implementation Plan

## Goal

Implement a new strategy named `dual-account-volume-strategy` as a distinct strategy type that reproduces the old HuFi-style paired execution flow on a centralized exchange, while preserving the existing `volume` strategy as the current single-account / AMM-oriented implementation.

## Summary

The current codebase already has a strategy runtime, session scheduler, dispatcher, intent pipeline, and direct admin market-making entrypoint. The missing piece is a dedicated strategy type that can coordinate two exchange accounts on the same exchange in a controlled maker/taker sequence.

This plan introduces `dualAccountVolume` as a new internal `controllerType` and strategy type. It does not replace or overload the current `volume` strategy.

## Desired Behavior

The new strategy should:

- run on one centralized exchange
- use two separate exchange accounts / API key labels on that exchange
- place a maker `postOnly` order from one account
- place a matching taker `IOC` order from the other account after a short delay
- repeat on a configurable interval until `numTrades` is reached
- stop cleanly and cancel any tracked open orders when stopped
- integrate with the existing strategy instance, session, and intent execution architecture

## Why a New Strategy Type

The current `volume` strategy in this repository has different semantics:

- `clob_cex`: single-account periodic order generation
- `amm_dex`: single-wallet AMM swap execution
- `clob_dex`: explicitly not implemented

Reusing the existing `volume` type for dual-account paired execution would create ambiguity in runtime behavior, config shape, UI, and validation rules. A separate strategy type is cleaner and safer.

## Proposed Internal Naming

- display name: `Dual Account Volume Strategy`
- controller type: `dualAccountVolume`
- strategy type: `dualAccountVolume`
- planning / docs name: `dual-account-volume-strategy`

## Scope

### In Scope

- backend strategy type and controller registration
- runtime session support for dual-account paired execution
- intent metadata support for account-specific routing
- centralized exchange execution using two account labels on the same exchange
- admin direct market-making integration
- frontend strategy definition and direct-start form support
- automated tests for dispatch, config, action generation, execution routing, and direct start validation

### Out of Scope for Initial Version

- regular user payment-based market-making flow integration
- advanced randomization of amount or price bands
- campaign/reward reporting changes
- support for DEX execution
- fallback smart rebalancing between accounts

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

### 2. Add DTOs and Config Shape

Define a dedicated DTO for the new strategy instead of reusing the current `ExecuteVolumeStrategyDto`.

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
- `userId`
- `clientId`

Suggested defaults:

- `makerAccountLabel = 'default'`
- `takerAccountLabel = 'account2'`

Validation rules:

- both account labels must be present
- labels must be different
- `exchangeName` and `symbol` are required
- numeric values must be finite and positive where appropriate

Files likely involved:

- `server/src/modules/market-making/strategy/config/strategy.dto.ts`
- any admin DTOs that expose strategy params
- frontend config template files for strategy definitions

### 3. Add Strategy Service Entry Point

Create a dedicated service entry point such as:

- `executeDualAccountVolumeStrategy(...)`

Responsibilities:

- build a strategy key using `dualAccountVolume`
- normalize and validate params
- upsert the strategy instance
- upsert the runtime session
- initialize `executedTrades = 0`

This should follow the same architectural pattern as the current strategy runtime instead of using an internal `setInterval` loop inside the method.

Files likely involved:

- `server/src/modules/market-making/strategy/strategy.service.ts`

### 4. Add a Dedicated Controller

Create `DualAccountVolumeStrategyController` implementing `StrategyController`.

Responsibilities:

- define cadence from `baseIntervalTime`
- call a dedicated dual-account action builder
- call a post-publish hook that increments `executedTrades`

Files likely involved:

- `server/src/modules/market-making/strategy/controllers/dual-account-volume-strategy.controller.ts`

### 5. Add Dual-Account Runtime Params and Action Builder

Add a new runtime param type distinct from the existing single-account volume params.

Suggested runtime params:

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
- `executedTrades`
- `userId`
- `clientId`

Add a dedicated builder, for example:

- `buildDualAccountVolumeSessionActions(...)`
- or `buildDualAccountVolumeActions(...)`

The builder should:

1. stop the strategy when `executedTrades >= numTrades`
2. fetch best bid / ask
3. compute the intended maker price from mid price, increment offset, and price push
4. determine maker side and taker side
5. compute the amount
6. emit a paired maker/taker action set with metadata linking them together

## Suggested Action Model

There are two viable approaches:

### Option A: Reuse `CREATE_ORDER` intents with metadata

Emit two `CREATE_ORDER` intents:

- maker intent with:
  - `metadata.accountLabel = makerAccountLabel`
  - `metadata.role = 'maker'`
  - `metadata.postOnly = true`
- taker intent with:
  - `metadata.accountLabel = takerAccountLabel`
  - `metadata.role = 'taker'`
  - `metadata.timeInForce = 'IOC'`
  - `metadata.pairedIntentId = makerIntentId`

This keeps the intent model simple and minimizes new intent types.

### Option B: Introduce a dedicated paired execution intent

Emit one higher-level intent like `EXECUTE_DUAL_ACCOUNT_VOLUME_CYCLE` and let the executor orchestrate both orders internally.

This gives stronger sequencing guarantees but requires more executor-specific logic.

### Recommendation

Start with **Option A** if the existing execution layer already supports passing order options from intent metadata. Otherwise use **Option B**.

## 6. Ensure Execution Can Route by Account Label

The critical requirement is routing the maker and taker orders to different exchange instances on the same exchange.

The execution path must support:

- `ExchangeInitService.getExchange(exchangeName, accountLabel)`

If current intent execution does not already read `metadata.accountLabel`, add support for it.

Execution behavior should be:

- maker order uses `makerAccountLabel`
- taker order uses `takerAccountLabel`
- both still use the same `exchangeName`

Files likely involved:

- `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`
- any order executor classes used by CEX intent execution
- possibly order tracker service if account-specific tracking is needed

## 7. Add Sequencing Guarantees for Maker Then Taker

The old implementation relies on strict sequencing:

1. place maker post-only order
2. wait a short delay
3. place taker IOC order at the matching price

The new implementation should preserve that behavior.

If using separate intents, sequencing can be implemented in one of these ways:

- executor detects paired metadata and delays taker until maker is accepted
- controller emits only maker first and emits taker in a follow-up tick or publish callback
- dedicated paired execution handler manages both steps atomically

### Recommended Initial Behavior

Implement sequencing in the execution layer so that:

- the maker order must be accepted first
- if maker placement fails, taker is not sent
- if taker placement fails, attempt best-effort cancellation of maker
- record failures in execution history / logs

This is the most faithful reproduction of the old behavior.

## 8. Price and Amount Logic

Initial implementation should remain simple and deterministic.

Suggested pricing logic:

- fetch `bestBid` and `bestAsk`
- compute `mid = (bestBid + bestAsk) / 2`
- compute `pushMultiplier = 1 + pricePushRate * executedTrades / 100`
- compute `basePrice = mid * pushMultiplier`
- compute offset using `baseIncrementPercentage`
- for maker side:
  - buy: `basePrice * (1 - offset)`
  - sell: `basePrice * (1 + offset)`
- quantize price and amount using exchange precision helpers

Suggested amount logic:

- start with `baseTradeAmount`
- optionally reduce to fit available balances on both accounts
- reject cycle if amount drops below exchange minimum

Initial version should avoid unnecessary randomization.

## 9. Direct Market Making Integration

The admin direct market-making flow currently only accepts `pureMarketMaking` strategy definitions. That restriction must be widened.

Files likely involved:

- `server/src/modules/admin/market-making/admin-direct-mm.service.ts`
- `server/src/modules/market-making/user-orders/user-orders.service.ts`

Changes:

- allow `dualAccountVolume` as a valid definition type for direct start
- keep `pureMarketMaking` behavior unchanged
- add dual-account validation on start:
  - maker and taker labels must differ
  - both account labels must exist for the same exchange
  - both API key records should belong to the same exchange

Snapshot override adjustments:

- inject `symbol = pair`
- inject `makerAccountLabel`
- inject `takerAccountLabel`
- keep `clientId = orderId`

Note: unlike `pureMarketMaking`, this strategy does not need `marketMakingOrderId` semantics for runtime identity.

## 10. Frontend Changes

The direct admin market-making UI needs to support selecting and configuring the new strategy.

Files likely involved:

- `interface/src/routes/(bottomNav)/(admin)/manage/market-making/direct/+page.svelte`
- `interface/src/lib/components/admin/settings/strategies/configTemplates.ts`
- strategy definition helpers and related types

Changes:

- allow strategy definitions with `controllerType = dualAccountVolume`
- render config fields dynamically for:
  - maker account label
  - taker account label
  - trade amount
  - interval
  - num trades
  - increment percentage
  - price push rate
  - maker side
- display strategy-specific configuration in direct order views

The user-facing regular payment flow should remain unchanged in the first version.

## 11. Testing Plan

Add tests for the following:

### Dispatcher / Mapping
- `dualAccountVolume` resolves to the new strategy type
- dispatcher starts the right strategy service method

### Strategy Service
- parameter validation
- session upsert
- stop behavior after `numTrades`
- correct side and pricing logic

### Action Generation
- maker and taker actions are generated with correct metadata
- account labels are attached correctly
- invalid balance / invalid amount cases are skipped safely

### Execution Layer
- maker routes to `makerAccountLabel`
- taker routes to `takerAccountLabel`
- taker is not executed when maker fails
- maker cancellation is attempted when taker fails

### Direct Market Making
- direct start accepts `dualAccountVolume`
- direct start rejects equal maker/taker labels
- direct start rejects incompatible strategy definitions

### Regression Coverage
- existing `volume` behavior remains unchanged
- existing `pureMarketMaking` behavior remains unchanged

## Validation

Before completion, run the repository validators relevant to touched files:

- lint
- typecheck
- tests

Prefer scoped test runs during development, then run the required final validators before completion.

## Recommended Delivery Order

1. backend strategy type + dispatcher + DTOs
2. strategy service session support
3. execution accountLabel routing
4. paired maker/taker sequencing
5. direct admin backend integration
6. frontend definition/template/form support
7. tests and validation

## Risks and Notes

- This strategy is operationally sensitive because it intentionally coordinates two accounts on one exchange.
- Metadata-driven execution routing must be carefully isolated so it does not affect existing strategies.
- The initial version should prioritize determinism and explicit validation over flexibility.
- Existing `volume` should remain available for single-account CEX / AMM use cases.

## Final Recommendation

Implement `dual-account-volume-strategy` as a fully separate strategy type with its own config shape, controller, and execution semantics. Reusing the existing `volume` strategy would blur responsibilities and make the system harder to reason about.
