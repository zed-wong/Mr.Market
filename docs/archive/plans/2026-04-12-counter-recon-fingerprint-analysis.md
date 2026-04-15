# Counter Reconnaissance Fingerprint Analysis

> **Status**: 🔍 Under Review
> **Created**: 2026-04-12

---

## Overview

Comprehensive analysis of detectable fingerprints in the current `dualAccountVolume` strategy (inherited from old HuFi). Covers order-level, timing, infrastructure, and cross-order correlation vectors.

---

## Category A: Order-Level Fingerprints

_Exchange can see per-order._

| # | Fingerprint | Current Code | Risk | Detection Method |
|---|------------|-------------|------|-----------------|
| **A1** | **Identical qty every trade** | `qty = new BigNumber(params.baseTradeAmount)` — never varies | 🔴 Critical | Statistical: same exact size repeating = bot |
| **A2** | **Deterministic buy/sell alternation** | `executedTrades % 2 === 0 ? 'buy' : 'sell'` | 🔴 Critical | Pattern: perfect BSBSBS... sequence |
| **A3** | **Deterministic price formula** | `mid × pushMultiplier × offset` — no noise | 🟡 High | Prices always at exact same % from mid |
| **A4** | **`mm-` prefixed clientOrderId** | `buildSubmittedClientOrderId` → `mm-{hash}-{seq}` | 🟡 High | Exchange sees all orders start with `mm-` — bot signature |
| **A5** | **Sequential clientOrderId** | seq increments 0, 1, 2, 3... per orderId | 🟠 Medium | Sequential IDs reveal automated ordering |
| **A6** | **postOnly maker + immediate IOC taker** | Maker always postOnly, taker always IOC | 🟠 Medium | This exact pattern = wash trade signal |

### Code References
- A1: `strategy.service.ts` L1558
- A2: `strategy.service.ts` L2297-2306 (`resolveVolumeSide`)
- A3: `strategy.service.ts` L1543-1557
- A4/A5: `common/helpers/client-order-id.ts` L14-32
- A6: `strategy-intent-execution.service.ts` L591-597

---

## Category B: Timing Fingerprints

_Exchange correlates timestamps._

| # | Fingerprint | Current Code | Risk | Detection Method |
|---|------------|-------------|------|-----------------|
| **B1** | **Fixed cadence interval** | `sanitizeVolumeCadenceMs` returns constant | 🔴 Critical | Trades at exactly N-second intervals = clock |
| **B2** | **Fixed maker→taker delay** | `makerDelayMs` is constant | 🟡 High | Same gap between maker fill and taker IOC every time |
| **B3** | **Global rate limiter creates cadence** | `minRequestIntervalMs=200ms` fixed between all requests | 🟠 Medium | Request spacing has machine-level regularity |
| **B4** | **Maker and taker execute synchronously** | `executeInlineDualAccountTaker` called inline after maker | 🟠 Medium | Taker always appears within ms of maker fill |

### Code References
- B1: `volume-controller.helpers.ts` L29-37
- B2: `strategy-intent-execution.service.ts` L582-587
- B3: `exchange-connector-adapter.service.ts` L295-304
- B4: `strategy-intent-execution.service.ts` L278-285

---

## Category C: Infrastructure Fingerprints

_Exchange correlates accounts._

| # | Fingerprint | Current Code | Risk | Detection Method |
|---|------------|-------------|------|-----------------|
| **C1** | **Same IP for all accounts** | All CCXT instances run from same server, no proxy config | 🔴 Critical | Exchange sees Account A and B always from same IP → linked |
| **C2** | **Same CCXT user-agent** | No custom headers, CCXT default user-agent for all | 🟡 High | All accounts have identical HTTP fingerprint |
| **C3** | **Same WebSocket connection pattern** | `ccxt.pro` WS connections from same host | 🟠 Medium | WS connection metadata correlates accounts |

### Code References
- C1/C2: `exchange-init.service.ts` L532-581 (no proxy/header config at instantiation)
- C3: `exchange-connector-adapter.service.ts` L152-160

---

## Category D: Cross-Order Correlation

_Exchange joins maker + taker._

| # | Fingerprint | Current Code | Risk | Detection Method |
|---|------------|-------------|------|-----------------|
| **D1** | **Maker always filled by same taker** | 2 accounts, always same pair | 🔴 Critical | Account A's limit always filled by Account B's IOC = wash |
| **D2** | **Taker qty exactly matches maker** | `takerIntent.qty = makerIntent.qty` | 🔴 Critical | Perfect size match every time |
| **D3** | **Taker price exactly matches maker** | `price: makerPrice` | 🟡 High | No slippage ever = coordinated |
| **D4** | **100% fill rate** | Every maker gets filled by its taker | 🟠 Medium | Real traders don't have 100% fill rate |

### Code References
- D1: `strategy.service.ts` L1577-1589 (always same 2 accounts)
- D2/D3: `strategy-intent-execution.service.ts` L591-607
- D4: Architectural — no mechanism for partial fills or missed cycles

---

## Summary by Severity

| Severity | Count | Items |
|----------|-------|-------|
| 🔴 Critical | 6 | A1, A2, B1, C1, D1, D2 |
| 🟡 High | 5 | A3, A4, B2, C2, D3 |
| 🟠 Medium | 5 | A5, A6, B3, B4, D4 |

---

## Remediation Matrix

| Layer | Items | Approach | Effort |
|-------|-------|----------|--------|
| **Code — easy** | A1, A2, A3, B1, B2 | Add jitter params + `Math.random()` (~30 lines) | Small |
| **Code — moderate** | A4, A5, A6, B4, D2 | Randomize clientOrderId prefix, randomize taker qty (partial fill), vary order types | Medium |
| **Code — hard** | D1, D3, D4 | Multi-account pool (see related plan), partial fills, decoy orders | Large |
| **Infrastructure** | C1, C2, C3 | Proxy rotation per account, custom user-agent per CCXT instance | Medium |
| **Architectural** | B3 | Per-account rate limiter instead of global | Medium |

## Minimum Implementation Scope

For the first implementation pass, only the minimum parts below are required.

### 1. Trade randomness layer

Goal: break the most obvious deterministic fingerprints without redesigning the strategy.

Minimum scope:
- Randomize trade size within bounded per-market ranges instead of using one exact `baseTradeAmount`
- Randomize buy/sell sequencing instead of strict alternation
- Randomize price offset from mid within configured bounds instead of a fixed formula output
- Randomize cadence and maker-to-taker delay within bounded windows

Directly mitigates:
- `A1` identical qty every trade
- `A2` deterministic buy/sell alternation
- `A3` deterministic price formula
- `B1` fixed cadence interval
- `B2` fixed maker→taker delay

Implementation note:
- Use bounded configuration-driven variance, not unbounded noise, so behavior stays controllable and market-safe

### 2. Per-account behavioral profiles

Goal: ensure accounts do not share the same statistical fingerprint.

Minimum scope:
- Give each account its own size range
- Give each account its own timing range
- Give each account its own placement aggressiveness / offset preference
- Give each account its own active session windows

Why this matters:
- Even if global randomness exists, identical parameter ranges across accounts still produce a correlated multi-account signature
- Per-account profiles reduce the chance that all accounts behave like one cloned bot

Supports mitigation of:
- `A1`, `A2`, `A3`, `B1`, `B2` at the account-correlation level
- Higher-level correlation through repeated identical account behavior over time

### Scope Boundary

This minimum pass does **not** solve the deeper structural risks below:
- `C1` same IP / infrastructure linkage
- `D1` same maker always filled by same taker
- `D2` exact maker/taker qty matching
- `D3` exact maker/taker price matching
- `D4` unrealistically consistent fills

Those require separate infrastructure and multi-account execution changes.

### Priority Recommendation

1. **Infrastructure first (C1, C2)** — if the exchange links accounts by IP, all other obfuscation is moot
2. **Code-easy fixes (A1, A2, A3, B1, B2)** — highest ROI, ~30 lines of code
3. **Code-moderate (A4, D2, B4)** — clientOrderId prefix randomization + taker qty variance
4. **Multi-account pool (D1, D4)** — requires the full multi-account strategy redesign

---

## Todo List

- [x] Add bounded trade-size randomization around `baseTradeAmount`
- [x] Add non-deterministic side selection to replace strict buy/sell alternation
- [x] Add bounded price-offset randomization around current mid-price placement logic
- [x] Add cadence jitter to replace fixed execution intervals
- [x] Add maker-to-taker delay jitter within configured timing bounds
- [x] Define per-account profile config structure for size, timing, placement, and session behavior
- [x] Assign each active account its own size range
- [x] Assign each active account its own timing range
- [x] Assign each active account its own placement aggressiveness / offset preference
- [x] Assign each active account its own active session windows
- [x] Ensure randomness remains configuration-driven, bounded, and market-safe
- [x] Validate that `A1`, `A2`, `A3`, `B1`, and `B2` are no longer deterministic in runtime behavior
- [x] Confirm the implementation does not claim to solve `C1`, `D1`, `D2`, `D3`, or `D4`
