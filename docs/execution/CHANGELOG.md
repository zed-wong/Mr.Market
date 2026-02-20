# Execution Flow Changelog

## 2026-02-12

- Add comprehensive `MIXIN_CLI_SKILL.md` guide covering installation, keystore setup, command groups, workflows, troubleshooting, and security practices
- Update `MIXIN_CLI_SKILL.md` to Safe-first transaction flows and deprecate top-level `transfer` usage for new integrations
- Restore `MARKET_MAKING_FLOW.md` as the backend runtime flow reference
- Add `docs/tests/MARKET_MAKING.MD` for end-to-end market making lifecycle testing guidance

## 2026-02-11

- Add tick-driven core foundation with `TickComponent` contract and `ClockTickCoordinatorService` registration/scheduling
- Rewrite `StrategyService` to tick-driven intent orchestration and register it with the clock coordinator
- Add idempotent `StrategyIntentExecutionService` to consume strategy intents with optional live execution flag
- Add single-writer balance ledger module with append-only entries, read-model balances, and idempotent mutation commands
- Add durability outbox and consumer receipt modules for restart-safe idempotent processing
- Add tick-based exchange state trackers for order books, private streams, and exchange orders
- Add periodic reconciliation service for ledger invariants and order-tracker consistency checks
- Add canonical HuFi campaign sync persistence with status normalization
- Add reward pipeline core entities/services for reward ledger, allocations, and ledger-based reward credits
- Add pause-withdraw orchestrator for stop-drain-unlock-debit-withdraw flow
- Add LP-share ledger with time-weighted share calculation for reward allocation basis
- Add reward receiver confirmation watcher and daily reward vault transfer workflow status updates
- Add HuFi score estimator snapshots derived from closed market-making fills
- Add reward consistency reconciliation against allocation totals per reward ledger entry
- Harden intent lifecycle with persistent status transitions, strict withdraw drain guard, and intent reconciliation checks
- Route snapshot payment intake and withdrawal processor through balance ledger credit/debit commands
- Add exchange connector adapter with per-exchange rate limiting and normalized REST/WS access methods
- Add execution retry/backoff with tracker updates and normalized execution event payloads
- Add quote executor manager for inventory skew, hanging orders, and maker-heavy quote shaping
- Add active cancel-until-drained loop in pause/withdraw orchestrator before unlocking funds
- Add explicit reward allocation rounding policy (floor to 8dp, remainder to largest-share user)
- Add reward vault transfer execution path via configured Mixin vault recipient transfer command
- Fix ledger and durability idempotency race windows, day-scope HuFi score aggregation, and reward vault status gating
- Harden ledger/processor reliability with SQLite-safe metrics bucketing, debit-before-refund compensation flow, and per-balance mutation locking
- Remove legacy execute_mm_cycle self-requeue path and document the current tick-driven market making flow
- Decouple tick from intent execution with async intent worker, bounded concurrency, and per-strategy FIFO safety gates
- Fix Nest config wiring by making ConfigModule global and removing local ConfigService shadow providers across modules

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
