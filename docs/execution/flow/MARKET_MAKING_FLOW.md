# Market Making Flow

This document describes the current backend market making flow.

It is based on the current implementation in `server/src/modules/market-making/**`.

## Architecture Summary

The runtime is now tick-driven and intent-driven.

1. Trackers update local exchange state on each tick.
2. Strategy builds intents from current state.
3. Intent executor sends exchange actions with idempotency and retries.
4. Ledger is the only balance mutation entrypoint.

The old queue self-loop `execute_mm_cycle` has been removed.
`start_mm` now registers the strategy session in `StrategyService`, and periodic execution comes from tick scheduling.

## Core Modules

- Tick coordinator: `server/src/modules/market-making/tick/clock-tick-coordinator.service.ts`
- Strategy runtime: `server/src/modules/market-making/strategy/strategy.service.ts`
- Intent execution: `server/src/modules/market-making/strategy/strategy-intent-execution.service.ts`
- Ledger: `server/src/modules/market-making/ledger/balance-ledger.service.ts`
- Main MM queue processor: `server/src/modules/market-making/user-orders/market-making.processor.ts`

## End-to-End Flow

### 1) Snapshot intake and payment state tracking

1. Snapshot polling routes market making create snapshots to `process_market_making_snapshots`.
2. `handleProcessMMSnapshot` validates pair and fee requirements.
3. Payment state is created or updated.
4. Snapshot intake is credited to ledger (`creditDeposit`) with idempotency key `snapshot-credit:{snapshotId}`.
5. `check_payment_complete` is queued.

## 2) Payment completion checks

1. `handleCheckPaymentComplete` verifies base, quote, and required fee coverage.
2. If payment is incomplete and timeout/retries are exceeded, order is failed and refunded.
3. If complete, intent state is updated and order state becomes `payment_complete`.

Current behavior:
- Queueing `withdraw_to_exchange` is still disabled in this flow.
- This path logs and stops at `payment_complete` unless other jobs/flows continue the lifecycle.

### 3) Withdrawal and campaign stage (when used)

If withdrawal path is enabled and used:

1. `withdraw_to_exchange` resolves network/deposit addresses.
2. Current code is validation mode and refunds instead of submitting real withdrawal.
3. `monitor_mixin_withdrawal` checks confirmation status and can queue `join_campaign`.
4. `join_campaign` creates local campaign participation and queues `start_mm`.

### 4) Start and stop market making

`start_mm`:
- Sets order state to `running`.
- Builds `PureMarketMakingStrategyDto` from order config.
- Calls `strategyService.executePureMarketMakingStrategy(...)`.
- Does not enqueue `execute_mm_cycle`.

`stop_mm`:
- Calls `strategyService.stopStrategyForUser(...)`.
- Sets order state to `stopped`.

### 5) Tick-driven strategy execution

1. `ClockTickCoordinatorService` calls `onTick` for registered components in order.
2. `StrategyService.onTick` runs active sessions by cadence.
3. For each session, strategy creates intents (create/cancel/stop) and persists them.
4. Tick does not synchronously execute intents when `strategy.intent_execution_driver=worker`.
5. `StrategyIntentWorkerService` polls pending intents and dispatches async execution.
6. Worker enforces safety gates: max global in-flight, max per-exchange in-flight, and one in-flight per strategy key.
7. `StrategyIntentExecutionService` executes exchange actions, updates trackers, and records durability status.

## Queue Jobs in Use

Queue: `market-making`

- `process_market_making_snapshots`
- `check_payment_complete`
- `withdraw_to_exchange`
- `monitor_mixin_withdrawal`
- `join_campaign`
- `start_mm`
- `stop_mm`

Removed from runtime flow:

- `execute_mm_cycle`

## Balance and Ledger Rules

All balance mutations must go through `BalanceLedgerService`.

Common mutations in MM flow:
- Snapshot intake: `creditDeposit`
- Refund path: `debitWithdrawal` before transfer
- Refund transfer failure: compensation `creditDeposit`
- Pause/withdraw orchestration: `unlockFunds` then `debitWithdrawal`

Concurrency protection:
- Ledger now serializes same `userId:assetId` mutation path in-process.

## State Progression

Common order states in current flow:

`payment_pending -> payment_complete -> campaign_joined -> running -> stopped`

Failure paths can move to:

`failed`

Exact transitions depend on which queue branches are enabled in your environment.

## Operational Notes

- `strategy.execute_intents=false` means intents are created and marked processed but no live exchange actions are sent.
- `strategy.intent_execution_driver=worker` decouples tick from exchange execution and keeps tick latency stable under load.
- `strategy.intent_execution_driver=sync` keeps legacy inline execution behavior and can increase tick latency.
- `withdraw_to_exchange` path is currently validation/refund mode in this implementation.
- Tick coordinator is now the periodic execution source for active strategy sessions.
- Reconciliation and trackers should be monitored to detect drift between local state and exchange state.

## Last Updated

- Date: 2026-02-11
- Status: Active
