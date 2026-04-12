# Multi Account Counter Recon Volume Strategy

> **Status**: 💡 Idea  
> **Created**: 2026-04-12  
> **Goal**: Maximize volume while minimizing mechanical trading fingerprint using multiple accounts (up to 10)

---

## Problem

The current dual account volume strategy only supports 2 accounts with fixed amount, fixed interval, and fixed roles — creating obvious mechanical trading patterns on exchanges.

## Core Idea

Each cycle randomly selects multiple maker-taker pairs from an account pool (2~10 accounts), with randomization across every dimension: quantity, price, timing, role assignment, and number of participants.

### Randomization Dimensions

| Dimension | Current (Mechanical) | New Design (Natural) |
|-----------|---------------------|----------------------|
| Accounts per cycle | Fixed 2 | Random 1~5 pairs |
| Order quantity | Fixed `baseTradeAmount` | `base ± jitterPct%` random |
| Price | Fixed mid ± offset | mid ± offset ± jitter (different per pair) |
| Timing | Fixed cadence | cadence ± jitter, each maker-taker delay also random |
| Role assignment | A=maker, B=taker fixed | Balance-based dynamic, same account can be maker or taker |
| Buy/sell direction | Alternating buy/sell | Same cycle can have both buy makers and sell makers |

## Proposed Parameters

```typescript
type MultiAccountVolumeStrategyParams = {
  // === Basic ===
  exchangeName: string;
  symbol: string;
  accountLabels: string[];              // 2~10 accounts

  // === Volume Control ===
  baseTradeAmount: number;              // Base qty per order
  qtyJitterPct: number;                 // Qty randomization (0~50%)
  targetQuoteVolume?: number;           // Stop when reached
  numTrades?: number;                   // Or stop by cycle count

  // === Price Control ===
  baseIncrementPercentage: number;      // Maker offset from mid %
  priceJitterPct: number;               // Price jitter (0~0.1%), different per pair
  pricePushRate: number;                // Long-term price push

  // === Anti-Fingerprint: Time ===
  baseIntervalTime: number;             // Base cycle interval (seconds)
  cadenceJitterPct: number;             // Cycle interval jitter (0~50%)
  makerDelayMs: number;                 // Base maker→taker delay
  delayJitterMs: number;                // Maker→taker delay jitter (ms)
  intraCycleSpreadMs: number;           // Stagger between pairs in same cycle (ms)

  // === Anti-Fingerprint: Count ===
  maxPairsPerCycle: number;             // Max maker-taker pairs per cycle (1~5)
  minPairsPerCycle?: number;            // Min pairs per cycle (default 1)

  // === Role Assignment ===
  allowSelfTrade: boolean;              // false = maker and taker can't be same account

  // === Runtime State (persisted) ===
  publishedCycles?: number;
  completedCycles?: number;
  tradedQuoteVolume?: number;
  realizedPnlQuote?: number;
};
```

## Execution Flow

Each cadence tick:

1. **Decide pair count**: `numPairs = random(minPairsPerCycle, maxPairsPerCycle)`
2. **Query all account balances**
3. **Assign maker-taker pairs** greedily by balance capacity
4. **For each pair**, generate randomized intent:
   - `qty = baseTradeAmount * (1 ± random * qtyJitterPct%)`
   - `price = mid * (1 ± (baseIncrementPct ± priceJitter) / 100)`
   - `delay = makerDelayMs ± random * delayJitterMs`
   - `intraCycleDelay = pairIndex * intraCycleSpreadMs + random(0, intraCycleSpreadMs)`
5. **Execute**: Each maker places a limit order, waits randomized delay, then taker places IOC

## Execution Layer Impact

- Existing `executeInlineDualAccountTaker` handles single maker→taker pair — **no major change needed**
- Relax the duplicate detection (side+price+qty match skip) to per-`intentId` dedup only
- Add `intraCycleDelayMs` sleep before each maker intent
- `incrementCompletedCycles` only fires on the last pair in a cycle

## Frontend UI Concept

```
┌─────────────────────────────────────────┐
│  Accounts (2-10)                   [+]  │
│  ┌──────────────────────────────────┐   │
│  │ 🔑 Account A (main)         [×] │   │
│  │ 🔑 Account B (sub1)         [×] │   │
│  │ 🔑 Account C (sub2)         [×] │   │
│  └──────────────────────────────────┘   │
│                                         │
│  Base Amount    [0.1    ] BTC           │
│  Target Volume  [50000  ] USDT          │
│                                         │
│  ▸ Anti-Fingerprint Settings            │
│    Pairs per cycle    [1 ] ~ [3 ]       │
│    Qty jitter         [30] %            │
│    Price jitter       [0.05] %          │
│    Cadence jitter     [40] %            │
│    Delay jitter       [500] ms          │
│    Intra-cycle spread [1000] ms         │
└─────────────────────────────────────────┘
```

## Backward Compatibility

- If `accountLabels` has 2 entries and `maxPairsPerCycle=1`, behavior is identical to current dual account strategy
- Old `makerAccountLabel` / `takerAccountLabel` fields auto-migrate to `accountLabels` on startup

## Files to Change

| Layer | File | Change |
|-------|------|--------|
| Types | `strategy.dto.ts` | New `ExecuteMultiAccountVolumeStrategyDto` |
| Types | `strategy.service.ts` types | New `MultiAccountVolumeStrategyParams` |
| Core | `strategy.service.ts` | New `buildMultiAccountVolumeActions` + `assignMakerTakerPairs` |
| Executor | `strategy-intent-execution.service.ts` | Relax dedup, add intraCycleDelay, fix completedCycles trigger |
| Controller | `dual-account-volume-strategy.controller.ts` | Adapt to new params |
| Frontend | `CreateOrderModal.svelte` | Dynamic account list + anti-fingerprint config UI |
| Frontend | `helpers.ts` | Handle new fields in `normalizeConfigOverrides` |

## Implementation Phases

1. Server params + cycle planner logic (single pair first)
2. Multi-pair concurrency + executor adaptation
3. Frontend UI
