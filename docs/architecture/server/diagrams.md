# Server Architecture Diagrams

Mermaid diagrams of the `server/` architecture, drawn from the yellowpaper
(`docs/product/yellowpaper.md`), whitepaper (`docs/product/whitepaper.md`),
the module map (`module-map.md`), and business flows (`business-flows.md`).

The yellowpaper is the source of truth. Where code and paper diverge, the paper wins.

---

## 1. Three-Layer Architecture (Yellowpaper §1)

The system is three vertical layers plus horizontal capabilities that cut across all of them.

```mermaid
flowchart TB
    subgraph FUND["💰 Funding Layer — fund entry/exit + balance source of truth"]
        direction LR
        F1["Mixin snapshots"]
        F2["EVM / Solana deposits"]
        F3["Withdrawals"]
        F4["Rewards"]
        F1 & F2 & F3 & F4 --> FOB["Order Balance<br/>(ledgerOrderId + asset)"]
    end

    subgraph SCHED["🗓️ Scheduling Layer — NestJS control plane"]
        direction LR
        S1["User orders<br/>+ lifecycle state machine"]
        S2["Strategy config<br/>snapshot resolution"]
        S3["Quota calculation"]
        S4["Tick coordinator<br/>+ queues + API"]
    end

    subgraph TRADE["📈 Trading Layer — tick-driven runtime"]
        direction LR
        T1["Controller"] --> T2["Action"] --> T3["Executor / Intent Worker"] --> T4["State / Report"]
    end

    subgraph HORIZ["⚙️ Horizontal capabilities (cut across every layer)"]
        direction LR
        H1["Ledger"]
        H2["Reconciliation"]
        H3["Risk / Kill-switch"]
        H4["Audit"]
        H5["Observability / Metrics"]
    end

    FUND --> SCHED --> TRADE
    HORIZ -.governs.-> FUND
    HORIZ -.governs.-> SCHED
    HORIZ -.governs.-> TRADE
```

### Core data flow (Yellowpaper §1)

```mermaid
flowchart LR
    A["funds enter"] --> B["order balance"]
    B --> C["strategy config<br/>snapshot"]
    C --> D["quota<br/>reservation"]
    D --> E["exchange order"]
    E --> F["fills & fees"]
    F --> G["ledger, rewards<br/>& audit records"]
```

---

## 2. Trading / Execution Layer Flow (Yellowpaper §4.4)

The execution layer separates *decision* (Controller) from *side effects* (Worker / Execution).
Tick only advances time; it must never block on exchange I/O, REST, or DB settlement.

```mermaid
flowchart TB
    subgraph CLOCK["Tick Coordinator (tick module)"]
        TICK["Tick signal @ fixed interval"]
    end

    subgraph DATA["Data components first (trackers) — write path is independent of tick"]
        WS["WebSocket / user stream / orderbook task"] --> SNAP["In-memory snapshot<br/>(order book, balances, order state)"]
        REST["REST poller (fallback only)"] -.corrects stale/missing.-> SNAP
    end

    subgraph DECIDE["Decision (strategy/controllers) — read-only"]
        FRESH{"freshness +<br/>health check"}
        CTRL["Strategy Controller<br/>(PMM, arbitrage, volume,<br/>time-indicator, dual-account)"]
        ACT["Action[]"]
    end

    subgraph SIDEEFFECTS["Side effects (strategy/execution) — independent workers"]
        STORE["Intent Store<br/>(batch write per cycle)"]
        WORKER["Intent Worker"]
        RISK["risk check"]
        RESV["reservation<br/>(reserve_lock)"]
        EXEC["Exchange connector adapter<br/>(place / cancel / retry)"]
    end

    subgraph SETTLE["Settlement & state (ledger, trackers, recon)"]
        FILL["Fill routing<br/>(clientOrderId / mapping)"]
        LEDGER["Ledger settlement<br/>(fill_settle / reserve_release)"]
        TRACK["Tracked order state"]
    end

    TICK --> FRESH
    SNAP --> FRESH
    FRESH -- stale --> SKIP["skip tick + record reason"]
    FRESH -- fresh --> CTRL
    CTRL -->|reads snapshot only| SNAP
    CTRL --> ACT --> STORE --> WORKER
    WORKER --> RISK --> RESV --> EXEC
    EXEC --> TRACK
    EXEC -.fills/cancels.-> FILL --> LEDGER
    RESV --> LEDGER
    EXEC -.error / fill.-> SNAP
```

### Parallelism boundaries (Yellowpaper §4.4.4)

```mermaid
flowchart TB
    POOL["Pooled executor registry"]
    POOL --> E1["ExchangePairExecutor<br/>(binanceA : BTC/USDT)"]
    POOL --> E2["ExchangePairExecutor<br/>(binanceA : ETH/USDT)"]
    POOL --> E3["ExchangePairExecutor<br/>(okxB : BTC/USDT)"]

    E1 -. parallel .- E2
    E1 -. parallel .- E3

    subgraph ONE["Inside one exchange:pair executor"]
        direction TB
        SER1["Same strategy → intents serial"]
        SER2["Same ledgerOrderId+asset →<br/>reservation/balance serial"]
        SER1 --> SER2
    end
    E1 --> ONE
```

---

## 3. Module Dependency Map (server/src/modules)

Domain-grouped view of how NestJS modules compose. `AppModule` is the only place
all domains are wired together.

```mermaid
flowchart TB
    APP["AppModule (root composition)"]

    subgraph MM["market-making domain"]
        STRAT["strategy (runtime)"]
        UO["user-orders"]
        TICKM["tick"]
        TRK["trackers"]
        EXM["execution"]
        LED["ledger"]
        DUR["durability"]
        ORCH["orchestration"]
        RECON["reconciliation"]
        REW["rewards"]
        FEE["fee"]
        PERF["performance"]
        APIKEY["exchange-api-key"]
        EVT["events"]
    end

    subgraph MIX["mixin domain"]
        SNAP["snapshots"]
        WD["withdrawal"]
        MCLI["client"]
        TXN["transaction"]
    end

    subgraph DATA["data domain"]
        GROW["grow-data"]
        SPOT["spot-data"]
        MKT["market-data"]
        CG["coingecko"]
    end

    subgraph INFRA["infrastructure"]
        EINIT["exchange-init"]
        CFG["custom-config"]
        LOG["logger"]
        HLTH["health"]
    end

    ADMIN["admin (control plane)"]
    WEB3["web3"]
    CAMP["campaign"]
    DEFI["defi (DEX adapters)"]

    APP --> MM & MIX & DATA & INFRA & ADMIN & WEB3 & CAMP & DEFI

    STRAT --> TICKM & EXM & TRK & LED & FEE & PERF & DUR
    UO --> STRAT & FEE & LED & SNAP & WD
    TRK --> TICKM & EXM & LED & EVT & MKT
    ORCH --> STRAT & LED & DUR & WD & TRK & EXM
    RECON --> TRK & LED
    REW --> LED & DUR & WEB3 & TXN
    LED --> DUR
    SNAP --> MCLI
    WD --> MCLI & LED
    STRAT --> DEFI
    ADMIN --> STRAT & LED & PERF & WEB3 & CAMP & UO & TRK & EXM
    WEB3 --> UO & LED & PERF
    EXM --> EINIT
    FEE --> EINIT
```

---

## 4. State Machines (Yellowpaper §3.5, §3.8)

### User order lifecycle

```mermaid
stateDiagram-v2
    [*] --> payment_pending
    payment_pending --> payment_incomplete
    payment_incomplete --> payment_complete
    payment_complete --> withdrawing
    withdrawing --> withdrawal_confirmed
    withdrawal_confirmed --> deposit_confirming
    deposit_confirming --> deposit_confirmed
    deposit_confirmed --> joining_campaign
    joining_campaign --> campaign_joined
    campaign_joined --> created
    payment_complete --> created: external steps disabled
    created --> running
    running --> paused
    paused --> running
    running --> stopped
    paused --> stopped
    stopped --> refunded
    refunded --> [*]
    payment_pending --> failed: any non-terminal → failed
    running --> failed
    failed --> [*]
```

### Intent state (Trading layer / StrategyOrderIntent)

```mermaid
stateDiagram-v2
    [*] --> NEW: Controller produced intent
    NEW --> SENT: submitted to worker
    SENT --> ACKED: exchange accepted
    ACKED --> DONE: filled / cancelled / no-op
    SENT --> FAILED
    ACKED --> CANCELLED
    DONE --> [*]
    FAILED --> [*]
    CANCELLED --> [*]
```

### Reservation lifecycle (Funding layer rule)

```mermaid
stateDiagram-v2
    [*] --> requested
    requested --> active
    active --> consumed: bound order filled
    active --> released: cancel / unused
    active --> expired: timed out, no order
    active --> failed
    active --> manual_review
    consumed --> [*]
    released --> [*]
    expired --> [*]
    failed --> [*]
```

### Withdrawal state

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> queued
    queued --> processing
    processing --> sent
    sent --> confirmed
    confirmed --> completed
    processing --> failed
    sent --> refunded
    completed --> [*]
```

---

## 5. Reward Distribution — Two-Layer Model (Whitepaper §, Yellowpaper §5)

```mermaid
flowchart TB
    subgraph OUTER["Outer layer — HuFi recording oracle"]
        ORACLE["Determines total reward<br/>Mr.Market receives per campaign"]
    end

    subgraph INNER["Inner layer — Mr.Market internal attribution"]
        BASIS["Eligible allocation basis<br/>(quote-side fill ledger entries)"]
        ALLOC["RewardAllocation<br/>(scoped to market-making orderId)"]
        CREDIT["Ledger credit to user"]
    end

    ORACLE --> BASIS --> ALLOC --> CREDIT
```

### Reward settlement state

```mermaid
stateDiagram-v2
    [*] --> OBSERVED
    OBSERVED --> CONFIRMED
    CONFIRMED --> DISTRIBUTED
    CONFIRMED --> TRANSFERRING_TO_MIXIN: if relay needed
    TRANSFERRING_TO_MIXIN --> TRANSFERRED_TO_MIXIN
    TRANSFERRED_TO_MIXIN --> DISTRIBUTED
    DISTRIBUTED --> [*]
```

---

## 6. Ledger + Durability Coupling (Business Flow 4)

Every balance change is an immutable, idempotent, transactional ledger entry.

```mermaid
sequenceDiagram
    participant Caller as Business service<br/>(user-orders / orchestration / rewards)
    participant Ledger as Ledger module
    participant DB as DB (LedgerEntry + OrderBalance)
    participant Dur as Durability (outbox)
    participant Cons as Consumer

    Caller->>Ledger: balance mutation command (idempotency key)
    Ledger->>DB: append LedgerEntry + update OrderBalance (atomic)
    Ledger-->>Caller: reject if same key / different payload
    Ledger->>Dur: append outbox event
    Dur->>Cons: deliver event
    Cons->>Dur: record receipt (idempotent)
```
