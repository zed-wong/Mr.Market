### 1) LP-share vs Per-fill attribution: which is “fair”?

“Fair” depends on what you mean by fairness. In pooled market making, users don’t submit orders directly; they contribute capital and the engine trades it. So the fairest model is the one that matches **what users actually control** and **what risks they bear**.

#### Option A — LP-share (time-weighted capital share)

Users earn based on **how much capital they contributed** and **how long it stayed deployed**.

**Pros**

* ✅ Matches what users control: *capital in the pool over time*
* ✅ Easy to audit / explain
* ✅ Stable under partial fills, retries, exchange outages
* ✅ Hard to game (no “wash fill” strategies by a single user)
* ✅ Works even if you cannot reliably attribute fills to “a user”

**Cons**

* ❌ Doesn’t reward “who caused fills” (but in pooled MM, users don’t cause fills anyway)
* ❌ If one user joins late in the day, needs correct time-weighting

**Fairness score (in pooled MM): High**

---

#### Option B — Per-fill attribution (allocate score per trade/fill)

Users earn based on the fills “their” capital supposedly produced.

**Pros**

* ✅ Feels intuitively “performance-based”
* ✅ Can reflect different user risk settings *if* you support per-user strategies

**Cons**

* ❌ In a pooled book, attribution is fundamentally ambiguous
* ❌ Easy to create disputes (“my funds were there but I didn’t get fills”)
* ❌ Easy to game if there’s any way to influence fills or routing
* ❌ Hard to reconcile when WS drops / partial fills / order merges
* ❌ Requires a much heavier event-sourced accounting system to be correct

**Fairness score (in pooled MM): Medium to Low** unless you truly isolate sub-books per user.

---

### Rating both options (with concrete metrics)

| Metric (what matters)                                       | Option A: LP-share |           Option B: Per-fill |
| ----------------------------------------------------------- | -----------------: | ---------------------------: |
| **Correctness under failure** (WS drops, lost events)       |               9/10 |                         5/10 |
| **Auditability / explainability**                           |              10/10 |                         6/10 |
| **Gaming resistance**                                       |               9/10 |                         4/10 |
| **Attribution precision** (if users had distinct execution) |               5/10 |                         9/10 |
| **Operational complexity**                                  |         3/10 (low) |                  9/10 (high) |
| **User dispute risk**                                       |                low |                         high |
| **Best fit for pooled MM**                                  |             ✅ best | ⚠️ only if isolated per-user |

**Recommendation:**

* If you run **one pooled MM engine**, Option A is the fairest *in practice* because it reflects contribution and risk exposure.
* Option B is only “more fair” if you run **segregated execution** per user or per cohort (separate books / separate inventory), otherwise it’s pseudo-precision.

---

## 2) Your campaign folder idea: ✅ yes, but keep boundaries strict

You said:

> Campaign Worker splits into Campaign Joiner + Campaign Orchestrator + Reward Accounting + Reward Receiver + Reward Distributor, under one campaign service.

That’s good as a *module boundary*. But enforce *internal boundaries*:

* **Joiner**: talks to HuFi only
* **Orchestrator**: converts campaign params → execution goals
* **Reward Receiver**: watches on-chain wallet only
* **Reward Accounting**: allocates internally (LP-share ledger)
* **Reward Distributor**: moves reward into Mixin ledger / credits users

And HuFi should be “third party module” like an exchange connector: agreed.

---

## 3) Reward flow you described (HuFi → EVM → Mixin) is solid

You want:

* HuFi contract pays rewards to server-owned EVM address
* Daily, EVM address transfers reward to **Mixin bot balance**
* Distribute internally in Mixin (0 gas)

That’s a great design because:

* on-chain interaction happens once per day per token (or even less if you batch)
* user distribution is off-chain inside Mixin
* your internal ledger becomes the source of truth

**But you must implement:**

* a **Reward Vault** abstraction (EVM wallet + token balances + idempotent transfers)
* an **Allocation Ledger** that is append-only and replayable
* a **Distribution Outbox** to guarantee “exactly-once” crediting to Mixin

---

# 4) Full server architecture / codebase design (clean, modular)

Below is a practical “production” layout (NestJS-friendly, but language-agnostic).

---

## 4.1 Modules (top-level)

```
src/
  app.module.ts

  modules/
    core/                 # shared primitives
    infra/                # DB, queues, logging, config, crypto
    event-bus/            # domain events + outbox

    exchange/             # connectors + trackers (execution truth)
    execution/            # execution engine (pure)
    strategy/             # quote/executor manager, tick logic

    mixin/                # mixin bot integration, internal transfers
    ledger/               # single-writer balance ledger

    campaigns/            # campaign service (orchestrators)
      hufi/               # HuFi integration as a third-party module

    withdrawals/          # user withdrawals orchestration
    users/                # user profile, eligibility, etc
    admin/                # ops endpoints / dashboards
```

---

## 4.2 Core boundaries (what is allowed to do what)

### A) Execution Core (never touches user balances)

**Modules**

* `exchange/` (connectors + trackers)
* `execution/` (place/cancel/retry)
* `strategy/` (executors, quoting logic)

**Owns**

* ExchangeOrderTracker (shadow ledger)
* OrderBookTracker
* UserStreamTracker

**Emits**

* `OrderCreated`, `OrderFilled`, `OrderCanceled`, `BalanceSnapshotObserved` (optional)

---

### B) Business Core (single writer for money)

**Modules**

* `ledger/` (BalanceLedgerService)
* `mixin/` (Mixin transfers)
* `campaigns/` (reward allocation)
* `withdrawals/`

**Owns**

* MixIn user order state
* User balances + locked balances
* Reward allocations

**Consumes**

* execution events (fills, cancels)
* campaign reward events (on-chain deposits)

---

## 4.3 Campaign Service (your requested “campaign folder”)

```
modules/campaigns/
  campaign.module.ts

  domain/
    campaign.entity.ts
    campaign-status.enum.ts
    day-window.ts

  application/
    campaign.service.ts
    campaign.scheduler.ts          # daily jobs

  workers/
    campaign-orchestrator.worker.ts
    quote-intent.publisher.ts

  rewards/
    reward-accounting.service.ts   # allocation logic (LP-share)
    reward-distributor.service.ts  # credit users in mixin
    reward-ledger.repo.ts

  adapters/
    execution-intent.adapter.ts    # converts goals -> executor intents
```

### HuFi as third party under campaigns/hufi/

```
modules/campaigns/hufi/
  hufi.module.ts

  hufi.client.ts                  # calls docs.hu.finance endpoints
  hufi.joiner.service.ts          # auto-join logic
  hufi.campaign-sync.service.ts   # pulls campaign params, statuses
  hufi.score-estimator.service.ts # optional: estimate HuFi score locally

  reward-receiver/
    chain-watcher.service.ts       # watches server EVM address
    reward-parser.service.ts       # maps tx -> campaign/day/token
    reward-vault.service.ts        # EVM wallet ops (send to mixin)
```

This matches your desire: “same campaign folder with sub folder”.

---

## 4.4 Ledger & accounting (single-writer design)

### Balance Ledger (critical)

```
modules/ledger/
  balance-ledger.service.ts      # only writer
  balance-ledger.repo.ts
  models/
    balance-account.ts
    ledger-entry.ts              # append-only
  policies/
    lock-policy.ts               # reserve funds for MM/withdraw
```

All credits/debits go through ledger entries:

* `LOCK`, `UNLOCK`
* `CREDIT_REWARD`
* `DEBIT_WITHDRAW`
* `SETTLE_MM_PNL` (optional)

---

## 4.5 Reward allocation algorithm (LP-share, time-weighted)

To make Option A fair, you do:

* Maintain user “shares” with time weighting:

  * deposits mint shares
  * withdrawals burn shares
* For each campaign day window:

  * compute `user_time_weighted_shares`
  * allocate reward proportionally

**Implementation pattern**

* event-sourced share changes
* daily snapshot job produces a deterministic allocation table
* distribution uses outbox to ensure exactly-once

---

## 4.6 On-chain → Mixin → Users reward pipeline (idempotent)

1. **Reward Receiver** sees on-chain transfer to server wallet
2. Writes `RewardLedger` entry (append-only)
3. **Reward Vault** transfers from EVM wallet → Mixin bot balance (daily)
4. Writes `RewardVaultTransfer` record (idempotent)
5. **Reward Accounting** computes allocations (per day)
6. **Reward Distributor** credits user balances in Mixin ledger
7. Writes distribution receipts (idempotent)

If any step crashes, you rerun safely because every step checks:

* “already processed tx_hash?”
* “already allocated for day?”
* “already credited user for allocation_id?”

---

# 5) What I’d add to your diagram (minimum additions)

Add these 3 boxes (they’re essential for your new requirement):

* **Reward Receiver (Chain Watcher)**
* **Reward Allocation Ledger**
* **Reward Distributor (Mixin internal transfers)**

And enforce that:

* Execution Engine never writes MixIn orders/balances
* Balance Ledger is single writer
* Campaign Orchestrator is the only thing that “joins” business goals to execution intents

---
