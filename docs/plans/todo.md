# Todos

---

## 1. Adaptive PMM

- Validate Adaptive PMM as the current execution-layer mainline.
- Confirm quote quality for arbitrary market pairs: signals, inventory skew, fee floor, min-notional, budgets, and cancel/create cadence.
- Re-check order lifecycle after the `StrategyService` split: reservation pause, fill settlement, reconciliation, and decision snapshots.

---

## 2. PNL / Inventory / Risk Views

- Current first task: choose a JS chart library for rendering PNL charts.
- Add chart views for total / realized / unrealized PNL.
- Add pair-level PNL, inventory exposure, fee cost, spread capture, and drawdown views.
- Add quote / fill / cancel timeline views backed by strategy decision snapshots and tracked-order state.

---

## 3. Volume Strategy

- Build Volume Strategy after PMM and PNL/Risk views are stable.
- Use it for HuFi campaign volume-based rewards.
- Track qualified volume, fee cost, expected reward, realized reward, and net PNL.

---

## 4. Product Loop / Funding Lifecycle

- Complete funding lifecycle: withdraw to exchange, track exchange deposit, auto-join campaign, then start market making.
- Complete Mixin campaign flow in `web3-interface`.
- Complete EVM wallet campaign flow in `web3-interface`.
- Improve market-making order list/detail pages so users can see joined campaigns, created orders, and produced volume.
- Keep admin setup, exchange/API key management, and strategy management as supporting product work.

---

## 5. Long Term

- Backtesting / replay.
- TEE / easyenclave.com.
- Mr.Market network.
- Leaderboard.


---

## To be determined

- Consider seeding non-sensitive environment settings with code defaults into DB-backed admin config, while keeping sensitive values in `.env` until encrypted secret storage exists.
- Consider splitting EVM private keys by purpose before adding admin-interface EVM configuration: operator/vault funding key, campaign signer key, DEX execution key, deployer-only key, and provider-only reads should have separate boundaries instead of sharing `WEB3_PRIVATE_KEY`.
