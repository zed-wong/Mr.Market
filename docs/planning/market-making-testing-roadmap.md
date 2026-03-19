# Market-Making Testing Roadmap

## Purpose

This roadmap stages testing in two tracks:

- Track A: execution-engine parity
- Track B: full market-making business lifecycle

The goal is to prove the runtime safely in the same order it is actually built:

1. prove the exchange-side execution engine through the same production path used on mainnet
2. only after that, expand coverage to the broader business lifecycle around payment, withdrawal, campaign, fill handling, reward, and ledger effects

This roadmap is the planning layer. It does not replace the lower-level implementation documents:

- `docs/planning/ccxt-sandbox-integration-testing-plan.md` remains the detailed execution-engine sandbox plan for Track A
- `docs/planning/complete-market-making-cycle-design.md` remains the broader business-lifecycle design reference for Track B

## Principles

- use the same production runtime path whenever parity is claimed
- require both exchange-side evidence and runtime-side evidence for every parity phase
- validate one reference exchange first, then promote other exchanges through a lightweight capability matrix
- never overclaim support that the runtime does not actually implement yet
- keep system tests opt-in and cleanup deterministic
- keep all system-test specs and their related support files under `server/test/system`

## Test File Placement

- all system-test specs must live under `server/test/system`
- all helpers, fixtures, and setup files used only by system tests must also live under `server/test/system`
- do not add new `*.system.spec.ts` files under `server/src`
- do not add new system-test-only helpers under `server/test/helpers`

## Evidence Model

### Exchange-Side Evidence

- returned exchange order IDs
- `fetchOrder()` visibility when supported
- `fetchOpenOrders()` visibility when supported
- successful cancel or equivalent closed-state confirmation
- live private fill events only after a real exchange private stream exists

### Runtime-Side Evidence

- `start_mm` and `stop_mm` state transitions
- executor session attachment and detachment
- published intents and final intent status
- persisted exchange-order mappings
- tracker state
- execution history

### Business-Side Evidence

- payment-state transitions
- withdrawal and deposit state transitions
- campaign join state
- performance, reward, and ledger outcomes

## Capability Matrix

Status values:

- `complete`: observed and passing in a real run
- `partial`: implemented or observed with a meaningful caveat
- `unknown`: not yet validated
- `blocked`: cannot be validated until runtime capability exists

The matrix records the highest validated phase ceiling per exchange. An exchange is only promoted after a real run.

| Exchange | Sandbox Boot | Spot Override | `fetchOrder` | `fetchOpenOrders` | `clientOrderId` | Private Fills | Highest Validated Phase | Notes                                                             |
| -------- | ------------ | ------------- | ------------ | ----------------- | --------------- | ------------- | ----------------------- | ----------------------------------------------------------------- |
| binance  | complete     | complete      | complete     | complete          | complete        | blocked       | A6                      | spot-only override required                                       |
| okx      | unknown      | unknown       | unknown      | unknown           | unknown         | blocked       | none                    | listed in sandbox env template; not yet validated in this roadmap |
| gate     | unknown      | unknown       | unknown      | unknown           | unknown         | blocked       | none                    | not yet validated                                                 |
| mexc     | unknown      | unknown       | unknown      | unknown           | unknown         | blocked       | none                    | not yet validated                                                 |

## Track A: Execution-Engine Parity

Track A covers the exchange-side execution engine only.

In scope:

- exchange boot
- `start_mm`
- `stop_mm`
- executor registration
- manual ticks
- intent generation
- intent execution
- tracker updates
- mapping persistence
- execution history

Out of scope for Track A:

- payment intake
- withdrawal and deposit orchestration
- campaign join flow
- reward lifecycle
- ledger lifecycle beyond execution-side assertions

### Phase A1: Exchange Boot Parity

Status: complete on reference exchange

Implementation checklist:

- [x] add env-driven sandbox exchange boot in `ExchangeInitService`
- [x] apply sandbox mode before `loadMarkets()`
- [x] support optional `CCXT_SANDBOX_ACCOUNT_LABEL`
- [x] preserve default `getExchange(exchangeName)` callers
- [x] ensure exchange-init background timers do not keep Jest alive

Verification checklist:

- [x] boot the sandbox exchange through real `ExchangeInitService`
- [x] fetch the exchange through the normal `getExchange()` contract
- [x] fetch public market data after sandbox boot

Exit gate:

- [x] the reference exchange can boot in sandbox mode through the production exchange-init path

### Phase A2: Exchange Order Lifecycle Parity

Status: complete on reference exchange

Implementation checklist:

- [x] route `sandbox-order-lifecycle.system.spec.ts` through real `ExchangeInitService`
- [x] place real sandbox orders through `ExchangeConnectorAdapterService`
- [x] make `fetchOrder()` assertions capability-aware
- [x] make `fetchOpenOrders()` assertions capability-aware
- [x] keep deterministic cleanup for created sandbox orders

Verification checklist:

- [x] fetch order book through the adapter
- [x] place a real sandbox order and receive a real exchange order ID
- [x] refetch the same order from the exchange
- [x] confirm open-order visibility when supported
- [x] cancel the order and confirm final state

Exit gate:

- [x] the reference exchange proves real order placement and cancel through the production exchange-init plus adapter path

### Phase A3: Runtime Control Parity

Status: complete on reference exchange

Implementation checklist:

- [x] add `server/test/system/helpers/market-making-runtime.helper.ts`
- [x] add persisted market-making order fixtures with valid `strategySnapshot.resolvedConfig`
- [x] add `server/test/system/market-making/user-orders/market-making.processor.system.spec.ts`
- [x] invoke `handleStartMM()` through the real processor
- [x] invoke `handleStopMM()` through the real processor
- [x] assert executor attachment and detachment through `ExecutorRegistry`

Verification checklist:

- [x] `start_mm` moves the order to `running`
- [x] the expected pooled executor contains the runtime session
- [x] `stop_mm` removes the runtime session
- [x] `stop_mm` moves the order to `stopped`
- [x] the suite cleans up any exchange orders created during the phase

Exit gate:

- [x] no mocked core runtime service remains in the phase boundary
- [x] both exchange-side and runtime-side evidence are captured

Non-claim:

- this phase must not claim exchange-order drain or cancel safety unless `stop_mm` actually implements it

### Phase A4: Single-Tick Intent Execution Parity

Status: complete on reference exchange

Implementation checklist:

- [x] add `server/test/system/helpers/market-making-single-tick.helper.ts`
- [x] add `server/test/system/market-making/strategy/pure-market-making-single-tick.system.spec.ts`
- [x] trigger one manual tick through the real executor path
- [x] assert one buy and one sell intent for a simple pure market-making order
- [x] assert intent execution uses the live sandbox exchange

Verification checklist:

- [x] one tick publishes the expected intents
- [x] intent status reaches `DONE`
- [x] real sandbox buy and sell orders are placed
- [x] exchange-order mappings are persisted
- [x] tracker state contains the expected open orders
- [x] execution history records the placed orders

Exit gate:

- [x] the reference exchange proves one full tick -> intent -> execution -> persistence loop

### Phase A5: Multi-Layer Placement Parity

Status: complete on reference exchange

Implementation checklist:

- [x] add `server/test/system/market-making/strategy/pure-market-making-multi-layer.system.spec.ts`
- [x] configure `numberOfLayers >= 3`
- [x] assert ladder generation rules and hanging-order behavior

Verification checklist:

- [x] the expected number of intents is generated
- [x] buy and sell prices expand outward by layer
- [x] quantities follow configured progression
- [x] real sandbox orders are placed for every eligible layer
- [x] tracker and mapping state stay consistent across layered placement

Exit gate:

- [x] layered runtime behavior is proven on the reference exchange without bypassing the normal executor path

### Phase A6: Cadence Stability Parity

Status: complete on reference exchange

Implementation checklist:

- [x] add `server/test/system/market-making/strategy/pure-market-making-cadence.system.spec.ts`
- [x] run repeated manual ticks through the same executor session
- [x] capture deterministic `clientOrderId` sequencing across cycles

Verification checklist:

- [x] follow-up intents are produced on later ticks
- [x] the executor remains stable across repeated cycles
- [x] `clientOrderId` sequencing increments deterministically
- [x] tracker and mapping state remain coherent after multiple cycles

Exit gate:

- [x] repeated tick-driven execution is stable on the reference exchange

### Phase A7: Fill Routing And Live-Fill Upgrade Gate

Status: complete on reference exchange

Implementation checklist:

- [x] keep routing-resolution coverage in `server/test/system/market-making/execution/sandbox-fill-resolution.system.spec.ts`
- [x] implement a real exchange private-fill ingestion path
- [x] add `server/test/system/market-making/execution/private-fill-ingestion.system.spec.ts`

Verification checklist:

- [x] parseable `clientOrderId` resolution works
- [x] client-order mapping fallback works
- [x] exchange-order mapping fallback works with a real sandbox order ID
- [x] a live exchange fill event routes through `FillRoutingService`
- [x] the correct executor receives the live fill

Exit gate:

- [x] live private-fill parity is only claimed after a real exchange private stream exists and is asserted deterministically

### Track A Completion Rule

Track A is considered complete for current runtime scope when:

- [x] phases A1 through A6 pass on the reference exchange
- [x] phase A7 remains explicitly marked partial or complete, never implied
- [x] phase A7 now passes on the reference exchange when a second sandbox account is configured for the counterparty live-fill assertion
- [x] the capability matrix records the highest validated phase ceiling for each tested exchange

## Track B: Full Market-Making Business Lifecycle

Track B starts only after Track A proves the execution engine is stable on the reference exchange.

Track B expands outward from execution into the surrounding business workflow.

### Phase B1: Order Creation And Payment Intake

Status: complete

Implementation checklist:

- [x] define a deterministic system-test entry path for market-making order creation
- [x] cover payment-state persistence and transition to `payment_complete`
- [x] verify `strategySnapshot` persistence for execution handoff

Verification checklist:

- [x] business-side payment state is correct
- [x] the persisted market-making order is valid for Track A runtime startup
- [x] ledger-side payment effects match implemented behavior

Exit gate:

- [x] the system can create a valid execution-ready market-making order through the real business flow

### Phase B2: Withdrawal And Exchange Funding

Status: blocked

Implementation checklist:

- [ ] define deterministic test accounts and balances for withdrawal coverage
- [ ] verify withdrawal requests, confirmations, and exchange funding handoff
- [ ] document any external dependency that prevents deterministic system testing

Verification checklist:

- [ ] withdrawal state transitions are observable
- [ ] exchange funding readiness is observable
- [ ] failures are recoverable and diagnosable

Exit gate:

- [ ] this phase only starts after deterministic funding and confirmation prerequisites exist

Current blocker:

- deterministic end-to-end funding and confirmation across external systems is not yet established

### Phase B3: Campaign Discovery, Join, And Runtime Handoff

Status: blocked

Implementation checklist:

- [ ] verify campaign discovery and matching
- [ ] verify join flow
- [ ] verify business handoff into `start_mm`

Verification checklist:

- [ ] campaign-side state is observable
- [ ] order state transitions match the implemented business flow
- [ ] runtime handoff reaches the Track A execution path

Exit gate:

- [ ] campaign integration must be deterministic enough to assert without synthetic shortcuts

### Phase B4: Fill Lifecycle, Performance, And Controlled Stop

Status: blocked

Implementation checklist:

- [ ] extend live-fill coverage from Track A7 into business-state assertions
- [ ] verify performance updates from real fills
- [ ] verify stop behavior against actual implemented runtime guarantees

Verification checklist:

- [ ] live fills update both execution state and business state
- [ ] performance data is consistent with recorded execution history
- [ ] stop behavior only claims what runtime actually guarantees

Exit gate:

- [ ] this phase cannot be completed before Track A7 live-fill parity exists

### Phase B5: Reward, Ledger, And Reconciliation Lifecycle

Status: blocked

Implementation checklist:

- [ ] define the deterministic reward and reconciliation test boundary
- [ ] verify ledger mutations against implemented reward flow
- [ ] verify reconciliation catches mismatches without false positives

Verification checklist:

- [ ] reward outputs are observable and explainable from fill/performance inputs
- [ ] ledger state matches implemented debits, credits, and reward transfers
- [ ] reconciliation reports are stable and meaningful

Exit gate:

- [ ] this phase only starts after the upstream business and fill phases are deterministic

## Immediate Next Implementation Order

- [x] build `server/test/system/helpers/market-making-runtime.helper.ts`
- [x] add `server/test/system/market-making/user-orders/market-making.processor.system.spec.ts`
- [x] add `server/test/system/helpers/market-making-single-tick.helper.ts`
- [x] add `server/test/system/market-making/strategy/pure-market-making-single-tick.system.spec.ts`
- [x] add `server/test/system/market-making/strategy/pure-market-making-multi-layer.system.spec.ts`
- [x] add `server/test/system/market-making/strategy/pure-market-making-cadence.system.spec.ts`
- [x] add `server/test/system/helpers/market-making-payment.helper.ts`
- [x] add `server/test/system/market-making/user-orders/market-making-payment-intake.system.spec.ts`
- [x] expand the capability matrix after each real exchange run
- [x] revisit Track B readiness only after Track A4 passes on the reference exchange

## Known Missing Runtime Capabilities

- `stop_mm` does not currently prove exchange-order drain or cancel safety
- deterministic end-to-end exchange funding and broader campaign lifecycle coverage is not yet established
- the per-exchange capability matrix is still mostly unvalidated beyond the reference exchange

## Status

- Created: 2026-03-18
- Updated: 2026-03-18
- Status: Draft
