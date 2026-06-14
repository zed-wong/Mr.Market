# Todos

2026-06-12
---
1. Admin Volume should support max volume auto stop, should clean up status display, should clean up account routing page for dual account orders(use trading/exchange-orders data for this page)
3. Fix order id inconsistency - done 2026-06-14
4. Design DEX support to support hyperliquid and PancakeSwap/Uniswap etc.. 
5. Design a great bussiness model
6. Add Exin-like spot support
---

## 3. Volume Strategy

- Build Volume Strategy after PMM and PNL/Risk views are stable.
- Use it for HuFi campaign volume-based rewards.
- Track qualified volume, fee cost, expected reward, realized reward, and net PNL.
- Automatically stop the volume strategy after it reaches the target volume.
- Product form should be a paid campaign-volume service: users pay to create an Volume execution order, while dual-account/API-key/EVM-wallet routing stays admin-only for now.

---

## 4. Product Loop / Funding Lifecycle

- Complete funding lifecycle: withdraw to exchange, track exchange deposit, auto-join campaign, then start market making.
- Add Exin-like spot support as a simple spot trading product path.
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
