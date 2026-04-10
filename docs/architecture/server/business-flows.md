# Server Business Flows

This file is the server-wide flow overview.

For the detailed market-making runtime lifecycle, use:

- `../market-making-flow.md`

## Flow 1: User market-making order lifecycle

Summary:

1. Client creates a market-making intent through `user-orders`.
2. Snapshot intake validates memo payload and payer identity.
3. Payment state and ledger state are updated.
4. System resolves config and stores a pinned `strategySnapshot`.
5. Later jobs may continue into withdrawal, campaign join, and `start_mm`.

Main modules:

- `mixin/snapshots`
- `market-making/user-orders`
- `market-making/fee`
- `market-making/strategy`
- `campaign`
- `market-making/local-campaign`

Why this flow exists:

- It turns external funding events into a durable market-making lifecycle.
- Orders snapshot resolved config at creation time so runtime does not re-resolve definitions.

Detailed reference:

- `../market-making-flow.md`

## Flow 1A: Admin direct market-making

Summary:

1. Admin creates a direct market-making order without the payment flow.
2. Service resolves a pinned strategy snapshot, writes `source=admin_direct`, and stores `apiKeyId` for account linkage.
3. Direct start reuses the same shared runtime start path as queue-driven `start_mm`.
4. Runtime health reads executor registry state, tracker data, and exchange balances for the admin status endpoint.
5. Optional HuFi campaign joins run asynchronously and may link or detach from the direct order lifecycle.

Main modules:

- `admin/market-making`
- `market-making/user-orders`
- `market-making/strategy`
- `market-making/trackers`
- `campaign`

Why this flow exists:

- Operations needs a fast path to start or stop market making for an exchange account without simulating funding.
- Admin-only orders must stay isolated from user-facing queries while still sharing the production runtime.

## Flow 2: Strategy runtime and pooled execution

Summary:

1. `start_mm` attaches an order to a pooled `ExchangePairExecutor(exchange, pair)`.
2. Tick coordination drives active executors.
3. Controllers compute actions from market data and pinned config.
4. Orchestrator writes intents and execution services perform side effects.
5. Private-stream fills route back to the correct runtime session.

Main modules:

- `market-making/strategy`
- `market-making/strategy/controllers`
- `market-making/strategy/execution`
- `market-making/execution`
- `market-making/trackers`
- `market-making/tick`

Why this flow exists:

- It separates decision logic from side effects.
- It shares exchange:pair market data across sessions, while account-aware execution/tracking keeps REST order management and private-stream fill routing pinned to the correct exchange account during restart recovery and shutdown cleanup.
- `dualAccountVolume` reuses the pooled executor on one exchange:pair but sequences maker placement on one account and taker IOC execution on a second account, with restart recovery cancelling dangling maker orders instead of replaying taker legs.

Detailed reference:

- `../market-making-flow.md`

## Flow 3: Pause and withdraw orchestration

Summary:

1. Orchestrator requests strategy stop.
2. System drains open exchange orders.
3. Ledger unlock and withdraw debit mutations are applied with idempotency keys.
4. Durable pending events are appended.
5. Withdrawal service executes the external withdrawal.
6. Success or failure paths append terminal events and compensate balances when needed.

Main modules:

- `market-making/orchestration`
- `market-making/ledger`
- `market-making/durability`
- `mixin/withdrawal`
- `market-making/trackers`

Why this flow exists:

- Withdrawal is a multi-step cross-module action that must stay safe and recoverable.

## Flow 4: Ledger and durability coupling

Summary:

1. Business services request a balance mutation command.
2. Ledger service applies append-only ledger entry plus read-model update atomically.
3. Mutation idempotency keys block duplicates.
4. Durability service appends outbox events for downstream processing.
5. Consumers record receipts for idempotent handling.

Main modules:

- `market-making/ledger`
- `market-making/durability`
- caller modules such as `user-orders`, `orchestration`, and `rewards`

Why this flow exists:

- Financial operations need replay safety, traceability, and deterministic compensation.

## Flow 5: Reward allocation and transfer

Summary:

1. Reward pipeline computes eligible allocation basis.
2. Share-ledger and reward-ledger entities are updated.
3. Reward receiver checks confirmations on schedule.
4. Reward vault transfer executes under durability guards.

Main modules:

- `market-making/rewards`
- `market-making/ledger`
- `market-making/durability`
- `mixin/transaction`
- `web3`

Why this flow exists:

- Reward distribution must be auditable, accurate, and retry-safe.

## Flow 6: Campaign sync and score update

Summary:

1. Scheduler syncs campaign data from external sources.
2. Join operations are scheduled for active participation.
3. Score estimator writes HUFI score snapshots from trading history.
4. Admin direct campaign joins may pre-bind exchange credentials, then transition through `pending`, `joined`, `linked`, or `detached` as runtime state changes.

Main modules:

- `campaign`
- `market-making/local-campaign`
- `market-making/strategy`
- `admin/market-making`

Why this flow exists:

- It connects trading activity to campaign participation and score tracking.
- Admin operations can prepare campaign linkage ahead of runtime start without exposing those records to user order views.

## Trigger Map

- HTTP controllers: admin, auth, data, user-orders, mixin, health
- Cron schedules: snapshots, campaign sync, score estimation, reconciliation, reward checks
- Queue processors: `snapshots`, `market-making`, `withdrawals`, `withdrawal-confirmations`, `local-campaigns`
- Runtime worker loops: strategy intent worker and tick coordinator

## Notes

- Some branches are conditional, especially around withdrawal queueing and campaign join behavior, so docs should describe intended flow without overstating currently enabled runtime paths.
- Legacy strategy aliases still exist for compatibility and should not be treated as the preferred new design.
