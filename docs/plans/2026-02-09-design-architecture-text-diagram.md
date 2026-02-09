```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      CLIENT / USERS                                          │
│  - Mixin users: deposit / start MM / pause / withdraw                                        │
│  - Admin: configs, monitoring, campaign controls                                             │
└───────────────┬───────────────────────────────────────────────┬──────────────────────────────┘
                │                                               │
                v                                               v
┌───────────────────────────────┐                     ┌───────────────────────────────┐
│        API / Controllers      │                     │            Admin API          │
│  auth/, mixin/, market-making/│                     │   admin/, configs, metrics    │
└───────────────┬───────────────┘                     └───────────────┬───────────────┘
                │                                                     │
                │ domain commands/events                              │ config + ops actions
                v                                                     v
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   BUSINESS DOMAIN LAYER                                      │
│        (owns user obligations, campaign participation, balances, rewards, withdrawals)       │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┐     ┌───────────────────────────────────────────────────┐  │
│  │ MixIn User Order Tracker     │     │ Campaign Orchestrator (Internal + External)       │  │
│  │ - user-orders.entity         │     │ - automatically join campaigns                    │  │
│  │ - states: CREATED/LOCKED/    │     │ - defines 24h windows, calculate participation    │  │
│  │   IN_MM/PAUSE/WITHDRAW/...   │     │ - coordinates pause/withdraw drain                │  │
│  └──────────────┬───────────────┘     └──────────────┬────────────────────────────────────┘  │
│                 │                                    │                                       │
│                 │ lock/unlock + state transitions    │ campaign intents                      │
│                 v                                    v                                       │
│  ┌────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          BALANCE LEDGER (SINGLE WRITER)                                │  │
│  │  - ledger-entry (append-only): LOCK/UNLOCK/CREDIT_REWARD/DEBIT_WITHDRAW/...            │  │
│  │  - balance read-model: available/locked                                                │  │
│  │  - ONLY place allowed to mutate balances                                               │  │
│  └──────────────┬─────────────────────────────────────────────────────────────────────────┘  │
│                 │                                                                            │
│                 │ emits balance/events / settlement events                                   │
│                 v                                                                            │
│  ┌──────────────────────────────┐     ┌───────────────────────────────────────────────────┐  │
│  │ Withdrawal Orchestrator      │     │ Reward Allocation & Distribution                  │  │
│  │ - drain MM -> settle ->      │     │ - LP-share time-weighted share ledger             │  │
│  │   execute withdrawal via     │     │ - compute per-day allocations                     │  │
│  │   mixin/withdrawal           │     │ - credit users (inside Mixin = 0 gas)             │  │
│  └──────────────────────────────┘     └───────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                │
                │ execution intents ONLY (place/cancel/refresh/stop)
                v
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                             MARKET MAKING “STRATEGY / INTENT” LAYER                          │
│                 (decision making; produces intents; does NOT talk to exchange)               │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Quote / Executor Manager                                                               │  │
│  │ - spawns per-market executors (quote sets)                                             │  │
│  │ - refresh cadence, tolerance, inventory skew, hanging orders, multi-level              │  │
│  │ - HuFi mode: maker-heavy bias; optional local score estimator                          │  │
│  │ - outputs intents: CREATE_ORDER / CANCEL_ORDER / REPRICE / STOP                        │  │
│  └────────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                │
                │ intents (idempotent) + retries handled below
                v
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                             MARKET MAKING EXECUTION CORE (PURE)                              │
│              (executes intents, manages retries/backoff; never updates user balances)        │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────┐     ┌─────────────────────────────────────────────────────┐   │
│  │ Clock / Tick Barrier      │     │ Execution Engine                                    │   │
│  │ - optional 1s tick        │───▶ │ - takes intents, routes to connectors               │   │
│  │ - deterministic ordering  │     │ - retry/backoff, rate-limit aware                   │   │
│  └───────────────────────────┘     │ - emits normalized events                           │   │
│                                    └───────────────┬─────────────────────────────────────┘   │
│                                                    │                                         │
│                                                    v                                         │
│                                    ┌─────────────────────────────────────────────────────┐   │
│                                    │ Exchange Connector(mainly use ccxt + customs)       │   │
│                                    │ - REST: place/cancel/snapshot                       │   │
│                                    │ - WS: market data + user stream                     │   │
│                                    │ - auth/signing + throttler (token bucket)           │   │
│                                    └───────────────┬─────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                │
                │ WS/REST data updates
                v
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  EXCHANGE STATE TRACKERS                                     │
│                       (exchange truth only; source = WS + REST reconcile)                    │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┐   ┌────────────────────────────────┐   ┌─────────────────┐ │
│  │ OrderBookTracker             │   │ ExchangeOrderTracker           │   │UserStreamTracker│ │
│  │ - snapshot + diff replay     │   │ - shadow ledger (client↔ex id) │   │ -fills/status   │ │
│  │ - sequence gap → resync      │   │ - lost order protocol + polling│   │ -balance updates│ │
│  └───────────────┬──────────────┘   └────────────────┬───────────────┘   └───────┬─────────┘ │
│                  └─────────────── normalized events ─┴───────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                │
                │ domain events (fills, cancels, order states, snapshots)
                v
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  INTERNAL EVENT BUS / OUTBOX                                 │
│        (guarantees idempotent processing; consumers update ledgers & read models safely)     │
└───────────────┬──────────────────────────────────────────────────────────────────────────────┘
                │
                ├───────────────────────────────┐
                │                               │
                v                               v
┌────────────────────────────────┐     ┌───────────────────────────────────────────────────────┐
│ Trade / Performance Read Models│     │ Balance Ledger + User Order Tracker Consumers         │
│ - trade.entity, performance    │     │ - settle fills (optional), update locks, states       │
│ - metrics/perf dashboards      │     │ - pause/withdraw triggers                             │
└────────────────────────────────┘     └───────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 HuFi (INTEGRATION)                                           │
│                 (treat like an external module: sync, join, receive reward)                  │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ HuFi Campaign Sync / Joiner                                                            │  │
│  │ - sync campaign params/status                                                          │  │
│  │ - auto-join via wallet signature (assume no gas; keep safety gate)                     │  │
│  │ - ensure exchange read-only API keys configured (HuFi verification)                    │  │
│  └────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Reward Receiver (On-chain)                                                             │  │
│  │ - watches server-owned EVM wallet for HuFi reward transfers                            │  │
│  │ - writes RewardLedger (append-only)                                                    │  │
│  └────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Reward Vault Transfer                                                                  │  │
│  │ - daily: EVM wallet → Mixin bot balance                                                │  │
│  │ - idempotent transfer receipts                                                         │  │
│  │ - reward calculation                                                                   │  │
│  └────────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                │
                │ reward events (observed/confirmed/transferred)
                v
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                        REWARD ACCOUNTING (INTERNAL FAIRNESS & DISTRIBUTION)                  │
│  - compute user deserved rewards (LP-share time-weighted capital share by campaign/day)      │
│  - write RewardAllocation ledger (append-only)                                               │
│  - distribute in Mixin (internal transfer, 0 gas) via Balance Ledger                         │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       DATA / INFRA                                           │
│  database/migrations, repositories, logger, health, custom-config, exchange-init, coingecko  │
│  - scheduled jobs: daily reward allocation, reconciliation, polling, campaign sync           │
│  - reconciliation: exchange open orders vs shadow ledger; HuFi paid vs internal allocations  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

