# Admin Direct Account Allocation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let multiple admin-direct market-making orders run concurrently on the same exchange without silently over-allocating the same physical account balance.

**Problem:** Current market-making ledger balances are isolated by `ledgerOrderId + asset`. Dual-account volume further scopes balances as `<orderId>:<accountLabel> + asset`. Real exchange balances are not scoped this way. They are shared by `exchangeName + accountLabel + asset`. This means multiple orders can each reserve successfully in their own ledger scope while competing for the same exchange free balance at placement time.

**Failure Mode:** If PMM and efficient dual-account volume share a physical account, PMM can lock or consume real `XIN` or `USDT` while volume's scoped ledger still shows funds available. The next volume placement can be rejected by the exchange as insufficient funds, causing `exchange_balance_rejected`, `reservation_pause`, and eventually `inline taker reservation paused for order balance mismatch`.

**Minimal Objective:** Add a small account-asset allocation layer at admin-direct start/resume time. Do not rewrite the execution path. Keep existing order-scoped reservation and ledger logic.

---

## Current Weak Points

- `BalanceLedgerService` locks reservations by `orderId + asset`, not by physical exchange account.
- `seedDualAccountScopedBalances()` can seed full exchange free balance into each scoped ledger, such as `<orderId>:4`, even if another order already uses that same account.
- `validateAccountAllocationOverlap()` checks active admin-direct orders by `exchangeName + apiKeyId`, but does not fully cover dual-account maker/taker scoped balances or different API key records that point to the same physical exchange account.
- Start/resume checks are moment-in-time. Runtime placement still depends on the exchange rejecting overuse.

## Minimal Design

Introduce a durable account allocation record:

```txt
exchangeName
accountLabel
assetId
orderId
allocatedAmount
state
createdAt
updatedAt
```

The allocation represents the maximum budget an order may seed into its order-scoped ledger for a specific physical account asset.

## Implementation Tasks

### Task 1: Add account allocation entity

**Files:**
- Add: `server/src/common/entities/ledger/market-making-account-allocation.entity.ts`
- Modify module/entity registration where ledger entities are registered.

- [ ] Create `MarketMakingAccountAllocation`.
- [ ] Add indexes on:
  - `exchangeName + accountLabel + assetId + state`
  - `orderId`
  - `exchangeName + accountLabel + assetId + orderId`
- [ ] Use string numeric columns for amounts, matching existing ledger conventions.

### Task 2: Add allocation service

**Files:**
- Add: `server/src/modules/market-making/ledger/account-allocation.service.ts`

- [ ] Add `allocateForOrder()` that checks:

```txt
sum(active allocations for exchangeName + accountLabel + assetId)
+ requested allocation
<= current exchange free balance
```

- [ ] Add `releaseForOrder(orderId)`.
- [ ] Add `getAllocationsForOrder(orderId)`.
- [ ] Use `BigNumber` for all amount math.

### Task 3: Wire admin-direct start/resume

**Files:**
- Modify: `server/src/modules/admin/market-making/admin-direct-mm.service.ts`

- [ ] During `directStart()`, allocate base and quote budgets before ledger seeding.
- [ ] During `directResume()`, refresh or reduce allocations to fit current exchange free balance.
- [ ] During `directStop()`, release allocations only after reservations are safely released or the order is terminal.

### Task 4: Fix dual-account seeding

**Files:**
- Modify: `server/src/modules/admin/market-making/admin-direct-mm.service.ts`

- [ ] Change `seedDualAccountScopedBalances()` to seed from account allocations, not full exchange free balance.
- [ ] Allocate separately for maker account and taker account.
- [ ] Ensure `<orderId>:<accountLabel>` receives only that account's allocated budget.

### Task 5: Keep execution unchanged

**Files:**
- No broad execution rewrite.

- [ ] Keep `OrderReservationService.reserveForLimitOrder()` scoped to `ledgerOrderId + asset`.
- [ ] Keep strategy controllers producing intents only.
- [ ] Keep intent workers responsible for exchange placement and ledger reservation.

### Task 6: Add tests

**Files:**
- Modify: `server/src/modules/admin/market-making/admin-direct-mm.service.spec.ts`
- Add service spec for account allocation service.

- [ ] Starting two orders on the same account cannot allocate more than exchange free balance.
- [ ] Dual-account taker allocation conflicts with another order using the same taker account.
- [ ] Dual-account scoped ledger is seeded from allocation, not full free balance.
- [ ] Stopping an order releases its allocation.

## Out of Scope

- Runtime global account-level reservation on every order placement.
- Detecting two different API key records that secretly represent the same exchange account, unless `accountLabel` already matches.
- Hot reallocating a running order's budget.
- Changing fill settlement or tracked order identity.

## Success Criteria

- Multiple orders can run concurrently when their account allocations fit within physical exchange free balances.
- Starting or resuming an order fails early if it would over-allocate a shared account.
- Efficient dual-account volume no longer duplicates full free balance into each scoped order ledger.
- Existing order-scoped ledger and reservation invariants remain intact.
