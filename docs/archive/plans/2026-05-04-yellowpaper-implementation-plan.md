# Yellowpaper Implementation Plan

## Goal

Turn `docs/product/yellowpaper.zh.md` from a technical source of truth into an executable implementation sequence.

The first execution milestone is not "implement the whole yellowpaper." The first milestone is:

```text
Order-scoped ledger
  -> OrderBalance read model
  -> reservation-safe balance mutation
  -> intent execution can no longer spend pooled user balance directly
```

After that is complete, later phases can wire fills, fee correction, withdrawal lifecycle, reconciliation, and rewards onto the same facts.

## Source Of Truth

- Product and technical spec: `docs/product/yellowpaper.zh.md`
- Superseded architecture reference: `docs/archive/plans/2026-04-26-improve-architecture-plan.md`
- Current module map: `docs/architecture/server/module-map.md`
- Current open work: `docs/plans/todo.md`

## Execution Verdict

The yellowpaper is ready as an architecture spec.

It is not ready to implement directly without this plan because several open decisions still affect schema, idempotency, queue boundaries, and test scope.

## Current Baseline

Existing backend pieces that should be reused:

| Existing piece | Current role | Reuse decision |
|---|---|---|
| `LedgerModule` / `BalanceLedgerService` | Append ledger entries and update a balance read model | Reuse service boundary, change ownership from user-level balance to order-level balance |
| `LedgerEntry` | Immutable balance mutation record | Extend or hard-cut fields to include `orderId`, content hash, and business-specific entry types |
| `BalanceReadModel` | Current per-user per-asset balance view | Replace for market-making with order-scoped `MarketMakingOrderBalance`; keep generic only if non-MM flows need it |
| `StrategyOrderIntentEntity` | Durable strategy execution intent | Reuse as reservation binding point |
| `tracked_order` / exchange order mapping | Maps exchange orders back to internal execution | Reuse as reservation/fill/reconciliation binding point |
| `DurabilityModule` | Outbox and idempotent receipt storage | Reuse for ledger/reconciliation events |
| `ReconciliationModule` | Consistency checks and repair logic | Extend around order balance, reservation, fills, rewards |
| `RewardsModule` | Reward pipeline and allocation | Reuse, but align distribution with confirmed campaign reward ledger |
| `ClockTickCoordinatorService` | Runtime tick coordinator | Reuse, but keep I/O out of tick path as yellowpaper requires |

Current mismatch that must be fixed before execution is trustworthy:

| Yellowpaper requirement | Current code shape | Risk |
|---|---|---|
| Balance belongs to a specific Mr.Market order | `BalanceReadModel` primary key is `userId + assetId` | Multiple user orders can spend the same user-level balance |
| Ledger entry must include `orderId` | `LedgerEntry` has `userId`, `assetId`, no `orderId` | Fill, fee, PnL, reward attribution can be ambiguous |
| Duplicate idempotency key with different payload must be rejected | Current ledger returns existing entry for duplicate key | A bad caller can hide mismatched replay content |
| Reservation is required before exchange order | Current ledger has `LOCK` / `UNLOCK`, but no explicit order-level reservation contract | External order can be placed without provable order-level locked quota |
| Ledger entry business types must map to yellowpaper semantics | Current enum includes `LOCK`, `UNLOCK`, `MM_REALIZED_PNL`, `ADJUSTMENT` | Generic adjustment can hide reservation, fee, fill, reversal reasons |

## NOT In Scope

- EVM and Solana funding entries. Mixin remains the current funding entry.
- DEX execution. First implementation scope is CEX only.
- Broad entity rename cleanup. Rename only entities on the ledger/reservation/fill path where ambiguity can cause accounting mistakes.
- Backward compatibility with old market-making balance semantics. This project explicitly prefers a clean current architecture over compatibility unless requested.
- UI redesign. UI may need new read models later, but this plan is backend-first.
- Full HuFi product expansion. This plan only covers the accounting/execution foundation needed by HuFi.

## Closed Execution Decisions

These decisions are accepted for the first implementation pass.

| Decision | Value |
|---|---|
| First rollout target | Admin-direct market-making only |
| Dev/local database handling | Hard-cut is allowed; no old market-making balance compatibility |
| Production migration | Defer until the hard-cut implementation is complete |
| Internal score MVP | Eligible fill quote volume |
| Estimated fee threshold | 15 minutes before reconciliation/manual review |

### D1. Strategy Snapshot Serialization

Decision: store `strategySnapshot` as canonical JSON with explicit decimal strings and a `configHash`.

```text
StrategyDefinition.defaultConfig
  + configOverrides
  -> schema validation
  -> decimal normalization to strings
  -> canonical JSON
  -> configHash
  -> MarketMakingOrder.strategySnapshot
```

Why: runtime must never re-resolve mutable `StrategyDefinition` for existing orders.

### D2. Internal Score Formula

Decision for MVP: use fill quote volume as the first internal score.

```text
user_internal_score = sum(fill.quote_notional for eligible fills)
```

Why: quote volume is simple, auditable, and maps to campaign market-making contribution better than fill count. Add mixed score later only when HuFi oracle semantics require it.

### D3. Rate Limit Partition

Decision: partition by `exchange + apiKeyId + pair + intentMutationType`.

```text
query lane: order status, open orders, balance refresh
mutation lane: create order, cancel order, withdraw
```

Why: create/cancel must not be blocked behind slow read polling, and multiple API keys on the same exchange should not unnecessarily serialize each other.

### D4. Fee Correction Delay

Decision: estimated fees may be used for reservation, but every estimated fee must be reconciled within one fill reconciliation cycle or marked `manual_review`.

MVP threshold:

```text
maxEstimatedFeeAge = 15 minutes
```

Why: indefinite estimated fees break user PnL and reward fairness.

### D5. Fill PubSub Mechanism

Decision: use the existing `MarketMakingEventBus` for in-process event fanout, plus `DurabilityModule` outbox for durable ledger/reward side effects.

Why: no new queue technology is needed for the first implementation. Boring wins.

## Target Data Flow

```text
Mixin snapshot / funding confirmation
  -> deposit_credit ledger entry
  -> MarketMakingOrderBalance available
  -> Strategy Controller reads cached market state
  -> Action[]
  -> StrategyOrderIntentEntity NEW
  -> Intent Worker
  -> risk check
  -> reserve_lock ledger entry
  -> MarketMakingOrderBalance available -> locked
  -> exchange create order
  -> tracked_order + exchange_order_mapping
  -> fill / cancel event
  -> fill_settle + fee_debit / reserve_release
  -> reconciliation + reward attribution
```

## Phase 0: Close Execution Decisions

### Tasks

- [x] Record final decisions for D1-D5 in this plan.
- [x] Allow local/dev DB hard-cut for market-making balance semantics.
- [x] Defer production migration design until the hard-cut implementation is complete.
- [x] Choose first rollout target: admin-direct market-making only.

### Acceptance

- [x] D1-D5 are no longer open in `docs/product/yellowpaper.zh.md`.
- [x] This plan has a "Decision Log" entry for each decision.
- [x] Implementation scope says exactly which runtime path is first.

## Phase 1: Order-Scoped Ledger And Balance

### Objective

Make market-making balances belong to `orderId + asset`, not `userId + assetId`.

### Entity Shape

Recommended new market-making read model:

```text
MarketMakingOrderBalance
  orderId
  userId
  assetId
  available
  locked
  total
  initialDeposit
  realizedDelta
  feePaid
  updatedAt
```

Recommended ledger fields:

```text
LedgerEntry
  entryId
  orderId
  userId
  assetId
  amount
  type
  idempotencyKey
  idempotencyContentHash
  refType
  refId
  reversalOf
  createdAt
```

Recommended ledger types:

```text
deposit_credit
reserve_lock
reserve_release
fill_settle
fee_debit
withdraw_debit
reward_credit
reversal
```

Avoid adding new generic `adjustment` paths. If a mutation cannot name its business reason, it should not mutate balance yet.

### Tasks

1. [x] Add market-making order balance entity.
2. [x] Add `orderId`, `idempotencyContentHash`, and `reversalOf` support to ledger entry.
3. [x] Replace market-making balance mutation commands with `orderId + assetId`.
4. [x] Reject duplicate idempotency keys when the content hash differs.
5. [x] Update deposit credit path to credit the specific market-making order.
6. [x] Add ledger rebuild helper:

```text
LedgerEntry(orderId, assetId)
  -> aggregate
  -> expected MarketMakingOrderBalance
  -> compare
  -> if mismatch: pause new reservation for affected order
```

### Acceptance Tests

- [x] Deposit credits one order balance, not every order from the same user.
- [x] Two orders from the same user and same asset do not share `available`.
- [x] Duplicate idempotency key with identical payload returns existing entry.
- [x] Duplicate idempotency key with different payload is rejected and audited.
- [x] Ledger and balance update commit atomically.
- [x] Rebuild from ledger matches the read model.
- [x] Mismatch detection blocks new reservation for the affected order.

## Phase 2: Reservation Contract

### Objective

Require a successful order-level reservation before any external exchange order can be created.

### Reservation Representation

MVP should not add a standalone `Reservation` table unless querying becomes painful.

Use:

```text
reserve_lock ledger entry
  + StrategyOrderIntentEntity.intentId
  + tracked_order / exchange_order_mapping ref
  + audit event
```

### Tasks

1. [x] Add reservation service around ledger lock/release semantics.
2. [x] Bind every active lock to exactly one intent or tracked exchange order.
3. [x] Release lock on exchange create failure, rejected order, cancel, expired order, or unfilled remainder.
4. [x] Consume lock on fill settlement.
5. [x] Add recovery scan for active locks without open exchange order or live intent.

### Acceptance Tests

- [x] Exchange order creation is impossible without prior `reserve_lock`.
- [x] Concurrent reserve attempts on the same `orderId + assetId` cannot overspend.
- [x] Exchange create failure releases lock or marks `manual_review`.
- [x] Partial fill consumes filled amount and leaves or releases the remainder correctly.
- [x] Restart recovery can reconcile active reservation with open exchange orders.

## Phase 3: Intent Worker Integration

### Objective

Move reservation, risk checks, exchange mutation, and tracked order creation into one explicit worker flow.

```text
StrategyOrderIntent NEW
  -> risk check
  -> reserve_lock
  -> exchange create/cancel
  -> tracked_order / mapping
  -> ACKED / FAILED / CANCELLED / DONE
```

### Tasks

1. [x] Add pre-execution risk gate:
   - [x] order state
   - [x] strategy instance state
   - [x] available balance
   - [x] trading rules
   - [x] market data freshness
   - [x] API key health
   - [x] rate limit
2. [x] Ensure per-strategy intent execution is serial.
3. [x] Ensure per-exchange/account mutation lanes are rate-limited.
4. [x] Ensure risk failure cannot create an exchange order.
5. [x] Ensure reserve failure cannot create an exchange order.

### Acceptance Tests

- [x] `NEW -> SENT -> ACKED -> DONE` happy path.
- [x] Risk failure goes to `FAILED` with no reservation and no exchange call.
- [x] Reserve failure goes to `FAILED` with no exchange call.
- [x] Exchange create failure releases reservation.
- [x] Same strategy intents execute serially.
- [x] Different exchange/account/pair lanes can execute in parallel.

## Phase 4: Fill, Fee, And PnL Settlement

### Objective

Make fills the only path that settles locked funds into realized order balance changes.

### Tasks

1. [x] Route user stream and REST-recovered fills into one settlement path.
2. [x] Deduplicate fills by stable exchange trade identity.
3. [x] Apply `fill_settle` for base/quote movement.
4. [x] Apply `fee_debit` with actual fee when available.
5. [x] Use estimated fee only until reconciliation supplies actual fee.
6. [x] Track realized PnL per order.
7. [x] Release or keep remaining lock after partial fill based on tracked order state.

### Acceptance Tests

- [x] Full fill settles base/quote and consumes reservation.
- [x] Partial fill settles filled amount and keeps or releases remainder correctly.
- [x] Duplicate fill event does not duplicate ledger impact.
- [x] Fee from exchange payload beats estimated fee.
- [x] Estimated fee older than threshold is flagged.
- [x] Fill with missing order mapping goes to reconciliation/manual review instead of mutating ambiguous balance.

## Phase 5: Funding And Withdrawal Lifecycle

### Objective

Finish the real funding lifecycle that `docs/plans/todo.md` still marks open.

```text
payment_complete
  -> withdrawing
  -> withdrawal_confirmed
  -> deposit_confirming
  -> deposit_confirmed
  -> joining_campaign
  -> campaign_joined
  -> created
  -> running
```

### Tasks

1. [x] Re-enable real `withdraw_to_exchange` execution for the selected rollout target.
2. [x] Track exchange deposit confirmation end to end.
3. [x] Trigger campaign join after deposit confirmation when a campaign applies.
4. [x] Start market-making only after required funding and campaign gates are satisfied.
5. [x] On stop/withdraw, stop new intents, cancel open orders, release reservations, then withdraw.

### Acceptance Tests

- [x] Successful payment-flow order reaches `running`.
- [x] Missing campaign match skips campaign join and reaches `created`.
- [x] HuFi join API failure leaves clear state and error reason.
- [x] Stop prevents new intents before cancel/release.
- [x] Withdrawal cannot execute while active reservation or open order remains.

## Phase 6: Reward Ledger And Allocation

### Objective

Allocate external campaign rewards only after confirmed campaign payout facts exist.

### Tasks

- [x] Confirm campaign reward from oracle.
- [x] Create campaign reward ledger entry.
- [x] Compute internal score from eligible attributable fills.
- [x] Apply platform fee.
- [x] Create user allocations.
- [x] Credit user/order reward only once.
- [x] Handle zero internal score with undistributed remainder.

### Acceptance Tests

- [x] `sum(user_rewards) + platform_fee + undistributed_remainder = gross_daily_payout`.
- [x] Already credited allocation is immutable.
- [x] Fee config change does not rewrite settled reward days.
- [x] Duplicate oracle payout observation is idempotent.
- [x] Missing fill attribution excludes fill from score and flags reconciliation.

## Phase 7: Reconciliation, Audit, And Observability

### Objective

Make every cross-system mismatch visible, bounded, and recoverable.

### Tasks

- [x] Reconcile order balance against ledger aggregate.
- [x] Reconcile tracked orders against exchange open/closed orders.
- [x] Reconcile fills against exchange trades via private trade/order refs.
- [x] Reconcile withdrawals against Mixin/exchange/chain evidence.
- [x] Reconcile rewards against oracle/campaign evidence.
- [x] Emit structured audit events for every automatic correction.
- [x] Block new risk-increasing operations for affected order/account when mismatch is unresolved.

### Acceptance Tests

- [x] Balance mismatch pauses new reservation.
- [x] Exchange order exists externally but not internally creates `internal_missing`.
- [x] Internal open order missing externally creates `external_missing` or final state after evidence.
- [x] Amount mismatch never rewrites ledger directly.
- [x] Automatic correction always has `refType`, `refId`, and audit event.

## Test Coverage Diagram

```text
CODE PATH COVERAGE TARGET
=========================
[+] Ledger mutation
    |
    +-- [DONE] deposit_credit order-scoped balance
    +-- [DONE] duplicate idempotency same payload
    +-- [DONE] duplicate idempotency different payload
    +-- [DONE] atomic ledger + read-model commit
    +-- [DONE] reversal and rebuild

[+] Reservation
    |
    +-- [DONE] reserve_lock before exchange create
    +-- [DONE] concurrent same orderId + assetId lock
    +-- [DONE] exchange create failure release
    +-- [DONE] partial fill consume/release split
    +-- [DONE] restart recovery active lock

[+] Intent worker
    |
    +-- [DONE] risk failure before reservation
    +-- [DONE] reservation failure before exchange call
    +-- [DONE] ACKED happy path
    +-- [DONE] FAILED release path
    +-- [DONE] per-strategy serial execution
    +-- [DONE] per-account rate limit lane

[+] Fill settlement
    |
    +-- [DONE] full fill settlement
    +-- [DONE] partial fill settlement
    +-- [DONE] duplicate fill dedupe
    +-- [DONE] actual fee debit
    +-- [DONE] estimated fee reversal after actual fee
    +-- [DONE] missing mapping manual review

[+] Funding lifecycle
    |
    +-- [DONE] payment -> withdrawal -> deposit -> created
    +-- [DONE] campaign join success
    +-- [DONE] campaign join failure
    +-- [DONE] stop blocks new intent before withdrawal

[+] Rewards
    |
    +-- [DONE] confirmed payout allocation
    +-- [DONE] zero internal score remainder
    +-- [DONE] duplicate payout idempotency
    +-- [DONE] settled allocation immutability
```

## Failure Modes

| Flow | Production failure | Required behavior |
|---|---|---|
| Deposit credit | Same Mixin snapshot processed twice | Idempotent no-op on identical payload |
| Deposit credit | Same idempotency key with different amount | Reject and audit |
| Reservation | Worker crash after lock before exchange order | Recovery releases or maps lock to tracked order |
| Reservation | Two workers reserve same order balance | One succeeds, one fails without negative balance |
| Exchange create | Exchange accepts order but response times out | Reconciliation searches by submitted client order id before release |
| Fill settlement | User stream sends duplicate trade | Dedup prevents duplicate ledger impact |
| Fee settlement | Exchange omits fee | Estimated fee applied, then reconciled or manual review after threshold |
| Withdrawal | User requests withdrawal while open order exists | Stop new intents, cancel open orders, release reservation first |
| Reward allocation | Oracle payout changes after distribution | Do not rewrite credited allocation; use new correction reward ledger entry |
| Reconciliation | Ledger/read model mismatch | Ledger wins, pause affected order's new reservation |

## Worktree Parallelization Strategy

Phase 1 should be sequential. It touches shared ledger entities, balance services, and tests.

After Phase 1 lands, phases can split:

| Lane | Workstream | Modules touched | Depends on |
|---|---|---|---|
| A | Reservation + intent worker | `ledger/`, `strategy/execution/`, `execution/` | Phase 1 |
| B | Funding lifecycle | `user-orders/`, `mixin/withdrawal/`, `exchange-api-key/` | Phase 1 |
| C | Fill + fee settlement | `trackers/`, `execution/`, `ledger/` | Phase 1, part of A |
| D | Rewards | `rewards/`, `campaign/`, `ledger/` | Phase 1, C for fill attribution |
| E | Reconciliation + observability | `reconciliation/`, `durability/`, `metrics/` | Phase 1, A/C for full coverage |

Execution order:

```text
Phase 0
  -> Phase 1
  -> Lane A + Lane B in parallel
  -> Lane C after A has reservation hooks
  -> Lane D after C has attributable fills
  -> Lane E can start after Phase 1, then deepen as A/C/D land
```

Conflict flags:

- Lane A and C both touch `strategy/execution/` and `ledger/`; coordinate or run sequentially.
- Lane D and E both touch `ledger/` read paths; keep write APIs owned by Phase 1/A to avoid divergent mutation entrypoints.

## Implementation Rules

- Use `BigNumber` for all amounts, prices, fees, score math, and reward allocation.
- Use `getRFC3339Timestamp()` for timestamps.
- All balance-changing operations must be idempotent.
- All balance-changing operations must run in a database transaction.
- Do not add generic adjustment paths for business mutations.
- Do not let strategy controllers call exchange mutation APIs directly.
- Do not let tick wait on exchange I/O or database settlement.
- Do not add compatibility paths unless explicitly requested.

## Validation Commands

Run targeted tests as each phase lands:

```bash
cd server
bun run test -- --testPathPattern='ledger|reconciliation|strategy-intent|market-making.processor|reward'
bun run test:system -- --testPathPattern='market-making'
```

Before shipping a phase:

```bash
bun run test
bun run test:system
```

## Decision Log

| Decision | Status | Value |
|---|---|---|
| D1 Strategy snapshot serialization | Accepted | Canonical JSON + decimal strings + `configHash` |
| D2 Internal score formula | Accepted | Eligible quote fill volume |
| D3 Rate limit partition | Accepted | `exchange + apiKeyId + pair + intentMutationType` |
| D4 Fee correction delay | Accepted | 15 minutes before manual review |
| D5 Fill PubSub mechanism | Accepted | `MarketMakingEventBus` + durable outbox |
| Rollout target | Accepted | Admin-direct market-making only for first implementation pass |
| Dev/local DB policy | Accepted | Hard-cut allowed; no old market-making balance compatibility |
| Production migration policy | Accepted | Defer production migration design until hard-cut implementation is complete |

## Definition Of Done

This plan is complete when:

- Market-making balances are order-scoped.
- Exchange order creation cannot bypass reservation.
- Fills and fees settle through ledger entries with order attribution.
- Withdrawal cannot race active orders or reservations.
- Reward allocation uses confirmed external reward facts and attributable internal fills.
- Reconciliation can detect and pause risk-expanding actions for mismatches.
- Tests cover every branch listed in the coverage diagram.
