# Hyperliquid Dual-Account Volume + PancakeSwap Volume Strategy

Date: 2026-04-13

Status: TODO

## Goal

1. Make the dual-account volume strategy work reliably on **Hyperliquid**.
2. Validate the single-account AMM volume strategy on **PancakeSwap V3** in a real environment.

---

## Part 1 — Hyperliquid Dual-Account Volume

### Context

Hyperliquid is a CLOB exchange accessible via CCXT. The dual-account volume strategy is exchange-agnostic but has only been tested on MEXC. Hyperliquid has its own API model (on-chain settlement, vault-based sub-accounts, different rate limits) that needs verification.

### 1.1 Exchange Integration Audit

- [ ] Confirm Hyperliquid CCXT driver supports `createOrder` with `postOnly: true` for maker legs
- [ ] Confirm Hyperliquid CCXT driver supports `createOrder` with `timeInForce: 'IOC'` for taker legs
- [ ] Confirm `fetchBalance` returns the expected free/used/total structure for both accounts
- [ ] Confirm `amountToPrecision` / `priceToPrecision` produce valid values (run `loadMarkets()` and inspect precision fields)
- [ ] Check whether Hyperliquid has self-trade prevention and how it behaves (reject vs. cancel-oldest)
- [ ] Document Hyperliquid rate limits and compare against `strategy.exchange_min_request_interval_ms` default (200ms)

### 1.2 Account Setup

- [ ] Determine how to create two isolated trading accounts on Hyperliquid (sub-accounts, separate wallets, or vaults)
- [ ] Verify `ExchangeInitService.getExchange(exchangeName, accountLabel)` can load two distinct Hyperliquid instances with different API keys
- [ ] Add two Hyperliquid API key entries in `api_keys_config` with distinct `accountLabel` values
- [ ] Fund both accounts with enough base + quote for the target pair

### 1.3 Exchange-Specific Adjustments (if needed)

- [ ] If Hyperliquid requires different order params (e.g. `type: 'limit'` vs perp-specific fields), add a thin normalization layer in `ExchangeConnectorAdapterService.placeLimitOrder`
- [ ] If rate limits are tighter than MEXC, add a Hyperliquid-specific `exchange_min_request_interval_ms` override or per-exchange config
- [ ] If self-trade prevention rejects taker orders, add a configurable price offset (e.g. 1 tick) to the taker leg so maker and taker prices don't collide

### 1.4 Testnet Dry Run

- [ ] Pick a liquid Hyperliquid testnet pair (e.g. ETH-USD perp)
- [ ] Run dual-account volume strategy with conservative params: `numTrades: 10`, `baseIntervalTime: 5000`, small `tradeAmount`
- [ ] Verify in logs: maker postOnly accepted, taker IOC filled, `completedCycles` increments correctly
- [ ] Check for: tick overlap, balance drift, partial fills, unexpected rejections
- [ ] Capture a log snapshot and compare against the MEXC baseline from `2026-04-13-dual-account-volume-runtime-follow-up-checklist.md`

### 1.5 Production Run

- [ ] Run with real funds on a low-value pair, small amounts, 20-50 trades
- [ ] Monitor: cycle success rate, latency per cycle, balance delta, any exchange errors
- [ ] Document any Hyperliquid-specific quirks discovered

---

## Part 2 — PancakeSwap V3 Volume Strategy (Real Environment Validation)

### Context

PancakeSwap V3 is already integrated as `dexId: 'pancakeV3'` with BSC (chain 56) addresses configured. The AMM volume strategy (`executionCategory: 'amm_dex'`) and `DexVolumeStrategyService` exist. This section is about validating it works end-to-end in a real environment.

### 2.1 Pre-flight Checks

- [ ] Verify BSC chain 56 PancakeSwap V3 contract addresses in `addresses.ts` are still current (factory, router, quoterV2, WBNB)
- [ ] Confirm the `PancakeV3Adapter` can call `quoteExactInputSingle` on the configured QuoterV2 for the target pair
- [ ] Confirm the target token pair has sufficient liquidity on PancakeSwap V3 (check pool TVL)
- [ ] Ensure the wallet (`recipient` address) has enough base token, quote token, and BNB for gas

### 2.2 Testnet Run (BSC Testnet or Fork)

- [ ] If BSC testnet has PancakeSwap V3 deployment, run against it first
- [ ] If not, use a local Hardhat/Anvil fork of BSC mainnet to simulate swaps without real funds
- [ ] Run volume strategy with `dexId: 'pancakeV3'`, `chainId: 56`, `numTrades: 5`, small `baseTradeAmount`
- [ ] Verify: swap executes, correct tokens move, `executedTrades` increments, slippage within `slippageBps`

### 2.3 Mainnet Validation

- [ ] Pick a high-liquidity PancakeSwap V3 pair on BSC (e.g. WBNB/USDT or CAKE/USDT)
- [ ] Run volume strategy with real funds: `numTrades: 10`, conservative `baseTradeAmount`, `slippageBps: 50`
- [ ] Verify in logs: each swap tx hash, gas cost, actual slippage, token balances before/after
- [ ] Check strategy completes all trades and stops cleanly

### 2.4 Gas & Cost Analysis

- [ ] Record average gas cost per swap on BSC
- [ ] Calculate total cost of a typical volume run (gas + slippage + price impact)
- [ ] Document recommended minimum `baseTradeAmount` and `slippageBps` for PancakeSwap V3

---

## Files Likely Touched

| Area | File | Change |
|------|------|--------|
| Exchange connector | `exchange-connector-adapter.service.ts` | Possible Hyperliquid-specific order param normalization |
| Exchange init | `exchange-init.service.ts` | Verify Hyperliquid multi-account loading works |
| DEX addresses | `server/src/modules/defi/addresses.ts` | Verify/update PancakeSwap V3 addresses |
| Frontend constants | `interface/src/lib/helpers/constants.ts` | Add `hyperliquid` to `SUPPORTED_EXCHANGES` if needed for UI |
| Config | env / strategy config | Hyperliquid-specific rate limit tuning |

## Non-Goals

- No new strategy type — both use existing `dualAccountVolume` (Hyperliquid) and `volume` with `amm_dex` (PancakeSwap).
- No multi-account counter-recon changes — that's tracked separately in `2026-04-12-multi-account-counter-recon-volume-strategy.md`.
- No new UI work — admin direct order flow already supports both.
