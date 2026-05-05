# Runtime Safety Mechanisms

This document lists the main runtime safeguards in Mr.Market backend, especially in market-making flow.

## Why this exists

The runtime is async and stateful (queue workers, exchange APIs, ledger, strategy intents). Safety guards reduce duplicate execution, balance corruption, stale state, and overload.

## Core safety mechanisms

## 1) Idempotency keys + unique constraints

- `BalanceLedgerService` writes each mutation with `idempotencyKey` and `idempotencyContentHash`; exact duplicates return `applied: false`, while same-key/different-payload replays are rejected.
- `ConsumerReceipt` enforces unique (`consumerName`, `idempotencyKey`) for once-only consumer marking.
- Used in:
  - `server/src/modules/market-making/ledger/balance-ledger.service.ts`
  - `server/src/modules/market-making/durability/durability.service.ts`
  - `server/src/common/entities/system/consumer-receipt.entity.ts`
  - `server/src/database/migrations/1770300000000-AddBalanceLedger.ts`
  - `server/src/database/migrations/1771000000000-AddConsumerReceiptUniq.ts`

## 2) Durable outbox + processed receipts

- `DurabilityService.appendOutboxEvent(...)` records durable events (`OutboxEvent`).
- `isProcessed/markProcessed` prevents duplicate consumption for named consumers.
- Used by strategy intent execution and ledger mutation paths.
- Files:
  - `server/src/modules/market-making/durability/durability.service.ts`
  - `server/src/common/entities/system/outbox-event.entity.ts`
  - `server/src/common/entities/system/consumer-receipt.entity.ts`

## 3) Ledger serialization and invariants

- Per `(orderId, assetId)` in-process lock serializes concurrent balance writes.
- Optional DB transaction path wraps ledger entry + `MarketMakingOrderBalance` projection updates.
- Balance math checks prevent negative available/locked and enforce numeric input.
- Negative `fill_settle` entries consume locked reservation balance; positive `fill_settle` entries credit available received assets.
- Actual exchange fill fees from user-stream trade payloads are applied as idempotent `fee_debit` ledger entries keyed by the same stable fill identity as the base/quote settlement.
- If actual fee debit cannot be applied after fill settlement, the fee is logged for manual review instead of replaying or rolling back the already-attributed fill.
- `FillSettlementService` owns fill base/quote and actual-fee ledger writes so user-stream and REST-recovered fills share one settlement boundary.
- Reconciliation reverses `market_making_estimated_fee` debits once a matching actual `market_making_fee` debit exists, and flags unreversed estimates older than 15 minutes.
- Orphaned fills with missing order attribution emit `fill.manual-review` and stay out of ledger mutation instead of guessing an order balance.
- Ledger rebuild can compare `LedgerEntry(orderId, assetId)` against the read model and pause new reservations for mismatched order balances.
- Pause/withdraw checks aggregate locked balance for the same user and asset across order scopes and refuses external withdrawal while any reservation remains.
- Market-making exchange withdrawal debits the order-scoped ledger before calling `WithdrawalService.executeWithdrawal`, uses the debit key as the Mixin request key, and compensates the debit if the external withdrawal call fails.
- After Mixin withdrawal confirmation, payment-flow orders enter `deposit_confirming`; exchange base/quote balances must meet the funded amounts before `deposit_confirmed` queues campaign handling.
- Required HuFi campaign joins call the configured signer/read-only exchange credential flow; failed joins fail the order instead of starting market making without campaign enrollment.
- Market-making orders persist lifecycle failure details in `lifecycleError` so failed gates keep an operator-visible reason.
- File: `server/src/modules/market-making/ledger/balance-ledger.service.ts`

## 4) Compensation for partial failure

- In market-making refund path, if ledger debit succeeds but transfer fails, compensation credit is applied.
- In strategy intent execution, `CREATE_LIMIT_ORDER` reserves order-scoped funds before exchange placement, releases that reservation when exchange create fails or returns a rejected/expired/cancelled acknowledgement, and releases unfilled remainder on final cancel acknowledgement.
- Reservation recovery scans active ledger locks, keeps reservations attached to live intents or open order ids, and releases clearly dangling locks with a stable recovery idempotency key.
- This reduces ledger/external transfer divergence.
- Files:
  - `server/src/modules/market-making/user-orders/market-making.processor.ts`
  - `server/src/modules/market-making/ledger/order-reservation.service.ts`
  - `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`

## 5) Retry, timeout, and bounded failure handling

- Strategy intent execution retries exchange calls with bounded retries + exponential backoff.
- Payment checks and withdrawal confirmation enforce timeouts and fail/refund on expiry.
- Files:
  - `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`
  - `server/src/modules/market-making/user-orders/market-making.processor.ts`

## 6) Worker concurrency gates

- Intent worker enforces:
  - global max in-flight,
  - per exchange/account/pair/mutation lane max in-flight,
  - one in-flight per strategy key,
  - no duplicate dispatch for already processed/in-flight intent.
- File: `server/src/modules/market-making/strategy/execution/strategy-intent-worker.service.ts`
- Create-intent execution validates basic order shape, known order state, cached market-data freshness, and API-key health before reservation: exchange, pair, side, positive quantity, positive price, running market-making order state, fresh tracked order book, `read-trade` permission, matching exchange, and `valid` API-key validation status must pass before any reservation or exchange placement.

## 7) Tick-loop safety

- Tick coordinator skips new tick if previous tick is still running.
- Unhealthy components are skipped instead of blocking entire loop.
- Files:
  - `server/src/modules/market-making/tick/clock-tick-coordinator.service.ts`
  - `server/src/modules/market-making/tick/tick-component.interface.ts`

## 8) Exchange API pacing (rate protection)

- Exchange connector adapter applies per-exchange minimum interval between requests.
- Helps reduce burst overload and exchange-side rate-limit issues.
- File: `server/src/modules/market-making/execution/exchange-connector-adapter.service.ts`

## 9) Atomic claim for withdrawal processing

- Withdrawal worker uses state-guarded SQL update (`pending/queued -> processing`) to avoid multi-worker double execution.
- Also keeps an in-memory processing set as an additional local guard.
- File: `server/src/modules/mixin/withdrawal/withdrawal.processor.ts`

## 10) Reconciliation checks (drift detection)

- Every 5 minutes, reconciliation scans for:
  - ledger invariant breaks,
  - reward allocation mismatches across user allocations, platform fee, and undistributed remainder,
  - market-making fills missing order/user/fill attribution,
  - fill ledger refs missing from exchange private trade/order evidence,
  - external-only open orders as `internal_missing`,
  - internal-only open orders as `external_missing`,
  - stale or inconsistent strategy intents.
- Automatic estimated-fee reversals emit `reconciliation.audit` events with correction `refType`, `refId`, and reversed ledger entry id.
- File: `server/src/modules/market-making/reconciliation/reconciliation.service.ts`

## 10.1) Reward vault transfer idempotency gate

- Reward vault transfer now checks durability idempotency (`isProcessed`) before calling external transfer.
- If already processed, it marks the row as transferred without sending funds again.
- After transfer, it requires `markProcessed(...)` to return true before persisting transferred status.
- If marker write fails, row reverts to `CONFIRMED` to avoid false success state.
- File: `server/src/modules/market-making/rewards/reward-vault-transfer.service.ts`

## 11) Safe pause-and-withdraw orchestration

- Stop strategy, cancel open orders until drained (with timeout), unlock funds, debit withdrawal, then transfer.
- Uses idempotency keys per operation step.
- Writes a durable pending withdrawal intent to outbox before external transfer.
- On external transfer failure, writes a failed intent and applies idempotent ledger compensation via rollback idempotency key.
- Clears intent only after successful transfer by writing a completed intent.
- File: `server/src/modules/market-making/orchestration/pause-withdraw-orchestrator.service.ts`

## 12) Fill routing fallback chain

- Fill arrives with `clientOrderId` from exchange private stream.
- `FillRoutingService` attempts resolution in order:
  1. Parse local `clientOrderId` format `{orderId}:{seq}` when the incoming value is parseable → route to order
  2. Lookup `ExchangeOrderMapping` by `clientOrderId` → route to order
  3. Lookup `ExchangeOrderMapping` by `exchangeOrderId` → route to order
  4. Log as orphaned fill with exchange/pair/side/time for manual review
- This ensures fills are routed even when the submitted exchange-safe `clientOrderId` is intentionally non-parseable.
- Files:
  - `server/src/modules/market-making/execution/fill-routing.service.ts`
  - `server/src/modules/market-making/execution/exchange-order-mapping.service.ts`
  - `server/src/common/helpers/client-order-id.ts`

## 13) Executor lifecycle safety

- `ExecutorRegistry` manages `ExchangePairExecutor` per `exchange:pair`.
- Executors are created on-demand when first order is added.
- Executors are removed automatically when no orders remain (`removeExecutorIfEmpty`).
- Each executor maintains isolated `strategySessions` map keyed by `orderId`.
- Tick execution checks `session.nextRunAtMs` before dispatch.
- Session runId guards against stale execution after order removal.
- Files:
  - `server/src/modules/market-making/strategy/execution/executor-registry.ts`
  - `server/src/modules/market-making/strategy/execution/exchange-pair-executor.ts`

## 14) clientOrderId format validation

- `buildClientOrderId()` validates:
  - `orderId` is non-empty and contains no `:` character
  - `seq` is a non-negative integer
- `buildSubmittedClientOrderId()` validates:
  - `orderId` is non-empty
  - `seq` is a non-negative integer
  - submitted IDs use exchange-safe characters only
- `parseClientOrderId()` validates:
  - Exactly two parts separated by `:`
  - Second part is numeric string
  - Result is a safe integer
- Live runtime order placement uses `buildSubmittedClientOrderId()` so exchanges that reject `:` still accept submitted values.
- This prevents parsing errors and exchange-side clientOrderId rejections while preserving local routing assertions.
- File: `server/src/common/helpers/client-order-id.ts`

## 15) Order snapshot requirement

- `start_mm` requires order to have `strategySnapshot` with `resolvedConfig`.
- Throws error if snapshot is missing. Current prototype guidance is to recreate the order through the active payment flow instead of backfilling legacy rows.
- This ensures all orders have pinned config before runtime execution.
- File: `server/src/modules/market-making/user-orders/market-making.processor.ts`

## Notes

- Reconciliation and outbox are complementary:
  - outbox/receipts reduce duplicate side effects and preserve event history,
  - reconciliation detects bad states that still happen despite safeguards.
- Current outbox path is write-focused in this codebase; dispatch/forwarding behavior should be documented when an outbox publisher is added.
- Fill routing fallback chain ensures no fills are lost due to parsing failures.
