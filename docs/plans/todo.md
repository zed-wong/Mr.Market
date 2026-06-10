# Todos

---

## 1. Adaptive PMM

- 48-hour launch priority: make Adaptive PMM user-facing as the real liquidity provision product. Users self-direct inventory/market risk, and only positive PnL after fees counts as earning.
- Validate Adaptive PMM as the current execution-layer mainline.
- Confirm quote quality for arbitrary market pairs: signals, inventory skew, fee floor, min-notional, budgets, and cancel/create cadence.
- Re-check order lifecycle after the `StrategyService` split: reservation pause, fill settlement, reconciliation, and decision snapshots.

---

## 2. PNL / Inventory / Risk Views

- Current first task: choose a JS chart library for rendering PNL charts.
- Add chart views for total / realized / unrealized PNL.
- Add pair-level PNL, inventory exposure, fee cost, spread capture, and drawdown views.
- Add quote / fill / cancel timeline views backed by strategy decision snapshots and tracked-order state.
- Build an admin Direct Market Making cost/revenue dashboard surfacing the metrics market makers care about (spread capture, fee cost, inventory skew, realized vs unrealized PNL, fill rate, quote uptime).

---

## 3. Volume Strategy

- 48-hour launch priority: make dual-account volume user-facing for HuFi campaign rewards, because HuFi currently rewards market making by volume. Users should be able to create a volume strategy from the frontend and see expected reward, fee cost, qualified volume, and net result.
- Build Volume Strategy after PMM and PNL/Risk views are stable.
- Use it for HuFi campaign volume-based rewards.
- Track qualified volume, fee cost, expected reward, realized reward, and net PNL.
- Automatically stop the volume strategy after it reaches the target volume.
- Product form should be a paid campaign-volume service: users pay to create an Volume execution order, while dual-account/API-key/EVM-wallet routing stays admin-only for now.

---

## 4. Product Loop / Funding Lifecycle

- Complete funding lifecycle: withdraw to exchange, track exchange deposit, auto-join campaign, then start market making.
- Complete Mixin campaign flow in `web3-interface`.
- Complete EVM wallet campaign flow in `web3-interface`.
- Improve market-making order list/detail pages so users can see joined campaigns, created orders, and produced volume.
- Keep admin setup, exchange/API key management, and strategy management as supporting product work.

---

## 5. Strategy Variation Editing

- Treat Strategy Definition and Strategy Variation as distinct concepts: editing the definition is supported today, editing and saving a variation is not.
- Land the existing plan to allow editing and persisting variations end-to-end (admin UI + API + storage).
- Ensure variation edits flow safely into running strategies without corrupting reservations, tracked orders, or decision snapshots.

---

## 6. Hyperliquid Support

- Scope is trading-only: exchange API key adapter layer + trading/market-making execution. No funding, custody, or product-loop work in this phase.
- Add a Hyperliquid adapter under the existing exchange API key management so credentials, signing, and venue routing match the current CEX pattern.
- Plug it into the trading/market-making path (order placement, fills, fees, reconciliation) under the same intent-worker model.

---

## 7. DeFi Support (Uniswap / PancakeSwap)

- Extend the trading layer to support on-chain execution via Uniswap and PancakeSwap.
- Reuse the order-attributed reservation, ledger, and reconciliation invariants for DEX fills, gas, and slippage.
- Coordinate with the EVM key split work in "To be determined" so DEX execution uses a dedicated key boundary.

---

## 8. Long Term

- Backtesting / replay.
- TEE / easyenclave.com.
- Mr.Market network.
- Leaderboard.


---

## To be determined

- Consider seeding non-sensitive environment settings with code defaults into DB-backed admin config, while keeping sensitive values in `.env` until encrypted secret storage exists.
- Consider splitting EVM private keys by purpose before adding admin-interface EVM configuration: operator/vault funding key, campaign signer key, DEX execution key, deployer-only key, and provider-only reads should have separate boundaries instead of sharing `WEB3_PRIVATE_KEY`.
