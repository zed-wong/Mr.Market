# Runtime Safety Mechanisms

This document lists the main runtime safeguards in Mr.Market backend, especially in market-making flow.

## Why this exists

The runtime is async and stateful (queue workers, exchange APIs, ledger, strategy intents). Safety guards reduce duplicate execution, balance corruption, stale state, and overload.

## Core safety mechanisms

## 1) Idempotency keys + unique constraints

- `BalanceLedgerService` writes each mutation with `idempotencyKey` and treats duplicates as `applied: false`.
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

- Per `(userId, assetId)` in-process lock serializes concurrent balance writes.
- Optional DB transaction path wraps entry + balance updates.
- Balance math checks prevent negative available/locked and enforce numeric input.
- File: `server/src/modules/market-making/ledger/balance-ledger.service.ts`

## 4) Compensation for partial failure

- In market-making refund path, if ledger debit succeeds but transfer fails, compensation credit is applied.
- This reduces ledger/external transfer divergence.
- File: `server/src/modules/market-making/user-orders/market-making.processor.ts`

## 5) Retry, timeout, and bounded failure handling

- Strategy intent execution retries exchange calls with bounded retries + exponential backoff.
- Payment checks and withdrawal confirmation enforce timeouts and fail/refund on expiry.
- Files:
  - `server/src/modules/market-making/strategy/strategy-intent-execution.service.ts`
  - `server/src/modules/market-making/user-orders/market-making.processor.ts`

## 6) Worker concurrency gates

- Intent worker enforces:
  - global max in-flight,
  - per-exchange max in-flight,
  - one in-flight per strategy key,
  - no duplicate dispatch for already processed/in-flight intent.
- File: `server/src/modules/market-making/strategy/strategy-intent-worker.service.ts`

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
  - reward over-allocation,
  - stale or inconsistent strategy intents.
- File: `server/src/modules/market-making/reconciliation/reconciliation.service.ts`

## 11) Safe pause-and-withdraw orchestration

- Stop strategy, cancel open orders until drained (with timeout), unlock funds, debit withdrawal, then transfer.
- Uses idempotency keys per operation step.
- Writes a durable pending withdrawal intent to outbox before external transfer.
- On external transfer failure, writes a failed intent and applies idempotent ledger compensation via rollback idempotency key.
- Clears intent only after successful transfer by writing a completed intent.
- File: `server/src/modules/market-making/orchestration/pause-withdraw-orchestrator.service.ts`

## Notes

- Reconciliation and outbox are complementary:
  - outbox/receipts reduce duplicate side effects and preserve event history,
  - reconciliation detects bad states that still happen despite safeguards.
- Current outbox path is write-focused in this codebase; dispatch/forwarding behavior should be documented when an outbox publisher is added.
