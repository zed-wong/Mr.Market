# Execution Flow Changelog

## 2026-02-20

- Add shared DaisyUI theme files for main/admin UI and map admin routes to dedicated admin theme tokens
- Refresh ui/DESIGN_PATTERN.md to match current theme files, typography, and layout wiring
- Localize hardcoded HuFi empty-state text in market-making pages with en/zh i18n keys
- Remove custom add mode from market-making pair dialog and simplify quick-add search/result UI
- Align spot-trading quick-add dialog inner content with market-making quick-add and unify dialog backdrop behavior
- Restore DaisyUI default semantic status colors and depth/border tokens in custom themes to recover previous badge, border, and shadow appearance
- Rework admin /manage dashboard to a TailAdmin-style shell with responsive sidebar drawer, sticky top bar, and refreshed stats/orders/users widgets for desktop and mobile

## 2026-02-05

- Switch Playwright workflow to SQLite and remove Postgres service

## 2026-02-06

- Adjust Mixin snapshot polling interval and clarify view-only exchange mode when no API keys

## 2026-02-04

- Add default ceiling/floor price when creating market making orders on payment completion and show payment success dialog after polling
- Store chain metadata for market-making pairs in grow data

## 2026-02-03

- Remove interface-side market making memo generator so intent API remains the memo source of truth
- Add guards and queue alignment for market-making processing (BigNumber import, withdrawal monitor retries, VWAP safety)

## 2026-02-02

- Allow market-making fee checks to treat base/quote assets as fees and dedupe payment check jobs per order

## 2026-01-31

- Add localized learn-more FAQ pages for Hu-Fi and market making (EN+ZH) with Playwright coverage and persisted language selection

## 2026-01-29

- Add quick market-making pair add flow that searches all exchanges and handles chain selection
- Cache CCXT exchange markets for 60 minutes to speed quick add lookups
- Register cache module for exchange init service
- Replace toast implementation with svelte-sonner (Svelte 4 compatible)
- Add quick add flow for spot trading and toast feedback on refresh actions
- Prevent duplicate adds for exchanges, API keys, and spot trading pairs

## 2026-01-28

- Remove Postgres leftovers and align configs/docs with SQLite
- Restore snapshot memo handling and defer market making order creation until payment completion

## 2026-01-13

- Apply agents.md rules to confirmPaymentInfo.svelte: replace uppercase with capitalize, replace h3 with span
- Disable market-making exchange withdrawals during validation; refund instead

## 2026-01-12

- Add i18n support to ExchangeSelection and ExchangeCard components
- Refactor trading pair selection UI components to match exchange selection style and follow GEMINI.md guidelines

## 2026-01-09

- Update MARKET_MAKING_FLOW.md state transitions to match actual code
- Fix withdrawal confirmation monitoring documentation with correct Mixin snapshot check
- Add withdrawal timeout (30 minutes) to error handling
- Add comprehensive ui/DESIGN_PATTERN.md with full design system documentation
