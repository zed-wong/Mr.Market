# Execution Flow Changelog

## 2026-03-18

- Add a new market-making testing roadmap plan that stages execution-engine parity before the broader business lifecycle, uses checkbox phase gates, and tracks exchange validation with a lightweight capability matrix
- Update `docs/plans/README.md` to index the new March 18 testing roadmap and clarify the March 15 sandbox plan as the detailed Track A execution-engine document

## 2026-03-17

- Reframe the CCXT sandbox testing plan as a production-parity execution-engine plan that requires the same exchange init and `start_mm` / `stop_mm` runtime paths as mainnet and explicitly gates remaining parity gaps
- Clarify `docs/tests/MARKET_MAKING.md` as documenting the currently implemented sandbox suites only, not the broader production-parity target
- Update `docs/plans/README.md` to describe the March 15 sandbox plan as the production-parity execution-testing source of truth
- Add a bottom-of-plan verification checklist to the March 15 sandbox plan that marks phases 1-4 as verifiable against real testnet orders and keeps private-fill ingestion explicitly gated
- Implement env-driven `CCXT_SANDBOX_*` boot in `ExchangeInitService`, route `sandbox-order-lifecycle.system.spec.ts` through the real exchange-init path, and unref exchange-init background timers so Jest exits cleanly
- Update sandbox env/docs references to include optional `CCXT_SANDBOX_ENABLED` and `CCXT_SANDBOX_ACCOUNT_LABEL` and describe the real ExchangeInitService-backed lifecycle suite

## 2026-03-14

- Clarify `STRATEGY_DEFINITION_GUIDE.md` to document the runtime-supported JSON Schema subset instead of claiming full spec support
- Remove stale strategy-definition version reference from `docs/code/server/business-flows.md` runtime pipeline flow
- Add TODO to require auth and ownership checks for private user-orders endpoints while keeping public strategy catalog access
- Bind market-making order intents to request `userId`, reject unsafe/schema-invalid configOverrides at creation time, and enforce payer-user consistency during snapshot intake
- Remove legacy admin backfill-definition-links and strategy definition export APIs after the prototype cutover to snapshot-only strategy startup
- Restrict market-making strategy selection/intents to `pureMarketMaking` definitions and preserve DEX volume config when controller reruns persisted strategies
- Reject unsupported `clob_dex` strategy-definition configs during resolver validation and remove the category from seeded volume-definition schema
- Stop admin strategy instances with `clientId` for non-pure-market-making definitions even when `marketMakingOrderId` is present
- Preserve arbitrage `exchangeBName`, `sellPrice`, and `profit` in strategy execution history migration metadata
- Align strategy i18n copy and market-making docs with the current order-binding and executor-routing behavior
- Make admin fee primary-config lookup read the earliest persisted config row instead of calling `findOne({ config_id: 1 })`, matching current repository mocks and seeded-data behavior
- Update `StrategyService` tests to register pooled executor sessions on tick paths and assert legacy arbitrage start hydration is unsupported
- Capture deferred volume, strategy admin, and seed follow-up work in `docs/TODO.md`

## 2026-03-15

- Add a docs-first instruction to `docs/AGENTS.md`/`CLAUDE.md` so documentation lookups start in `docs/`
- Merge `docs/plans/2026-03-15-system-test-design.md` into the March 15 sandbox single-source plan and remove the duplicate companion doc
- Merge exchange-side pure market-making sandbox runtime coverage into `docs/plans/2026-03-15-ccxt-sandbox-integration-testing-plan.md` as part of the March 15 single-source test plan
- Default market-making intent execution to enabled unless `MARKET_MAKING_EXECUTE_INTENTS=false` is set explicitly
- Rewrite `docs/plans/2026-03-15-system-test-design.md` in English and narrow its claimed system-test boundaries to match current runtime capabilities
- Rename sandbox integration spec files and suite titles to describe actual operations (`sandbox-order-lifecycle`, `sandbox-fill-resolution`) instead of internal service names
- Force Binance sandbox integration helpers to load spot markets only so real sandbox orders do not route into deprecated futures testnet endpoints
- Use exchange-safe sandbox `clientOrderId` values in real integration order placement while keeping `{orderId}:{seq}` parsing coverage as a local fill-routing assertion
- Group `server/.env.testnet.example` into required versus optional sandbox variables so the template matches actual integration-test behavior
- Clarify `server/.env.testnet.example` as the template to copy into `server/.env.testnet` for auto-loaded sandbox integration config
- Auto-load `server/.env.testnet` from the backend non-unit Jest config so `bun run test:system` picks up `CCXT_SANDBOX_*` without manual exports
- Route backend sandbox checks through `test:system`, add `test:all` for unit+system coverage, and keep the default unit suite isolated from `*.system.spec.ts`
- Reorganize `server/test` into `config/`, `helpers/`, and `system/`, and rename misclassified backend `e2e` specs to `*.system.spec.ts`
- Add `SandboxExchangeHelper` to bootstrap CCXT sandbox exchanges with `setSandboxMode(true)`, tracked-order cleanup, and shared polling utilities
- Add real sandbox integration specs for `ExchangeConnectorAdapterService` order lifecycle coverage and `FillRoutingService` mapping fallback coverage
- Rewrite `docs/tests/MARKET_MAKING.md` to document the current sandbox integration scope, required envs, skip behavior, cleanup behavior, and deferred full-E2E gate
- Rewrite the CCXT sandbox integration testing plan docs to use isolated test helpers, explicit `setSandboxMode(true)` guidance, Bun-based commands, and executable integration scopes instead of placeholder or production-risky steps
- Remove the duplicate March 15 market-making sandbox E2E plan and keep the CCXT sandbox integration testing plan as the only source of truth
- Consolidate the March 15 sandbox testing docs into a phased plan: adapter sandbox integration, fill-routing integration, and deferred full-E2E upgrade prerequisites
- Merge the March 15 sandbox testing docs into a single source-of-truth plan and remove the split implementation/E2E companion docs

## 2026-03-13

- Remove strategy definition publish/version APIs and version metadata so definitions remain config templates bound to local runtime controllers
- Refine ADR-001 static strategy logic decision to define user/admin/platform boundaries, disallow runtime-uploaded strategy code, and clarify config templates vs executable logic
- Rename admin-spot-management module to spot for consistency (AdminSpotManagementService → AdminSpotService)
- Add backup seeder dataset for exchange `exchange_id` + `name` + `icon_url` mappings (`exchange-icon-backup.ts`) without wiring it into active seed flow

## 2026-03-12

- Update docs/code/server documentation to reflect current module structure (strategy module internal directories, defi adapters, IndicatorStrategyHistory entity)

## 2026-03-11

- Add pooled executor architecture with ExecutorRegistry managing ExchangePairExecutor per exchange:pair
- Add strategySnapshot to MarketMakingOrder with definitionVersion, controllerType, and resolvedConfig
- Add configOverrides to MarketMakingOrderIntent for user-provided config at order creation
- Add StrategyConfigResolverService.resolveForOrderSnapshot() for config resolution at order creation
- Add clientOrderId format helpers in common/helpers/client-order-id.ts (format: {orderId}:{seq})
- Add ExchangeOrderMapping entity and service for fill routing fallback
- Add FillRoutingService with clientOrderId parsing and fallback chain
- Migrate StrategyService to use ExecutorRegistry for pooled execution
- Move runtime config source of truth to MarketMakingOrder.strategySnapshot while keeping StrategyInstance for lifecycle metadata
- Replace YAML-based strategy seed/export artifacts with JSON definitions and JSON export payloads

## 2026-03-06

- Add Hummingbot-compatible YAML strategy definitions in seeders (pure-market-making, arbitrage, volume, time-indicator)
- Add YAML loader utility for parsing strategy definition files from seeder data directory
- Add export endpoint for strategy definitions (GET /admin/strategy/definitions/:id/export)
- Update strategy seeder to load definitions from YAML files instead of hardcoded TypeScript objects
- Align YAML field names with DTO structure (camelCase) and add required fields (userId, clientId, pair, exchangeName)

## 2026-03-05

- Remove legacy `StrategyController` `/strategy/*` API surface and keep strategy runtime control on shared admin (`/admin/strategy/*`) and queue/user-orders flows only
- Complete strategy runtime folder reorganization under `server/src/modules/market-making/strategy` into `config`, `controllers`, `intent`, `execution`, `data`, and `dex`, and update admin imports/docs to new paths
- Add comprehensive backend design logic doc tree under `docs/code/server` with module map, module purpose, business flows, and entity ownership matrix
- Fix `StrategyControllerRegistry` constructor corruption so `getController` and `listControllerTypes` are available to strategy runtime and test compilation
- Stabilize interface CI checks by running E2E tests sequentially (`test:e2e --workers=1`) and making `test` wait for E2E before unit tests

## 2026-03-04

- Rename dynamic strategy transition plan doc to `docs/plans/2026-03-04-dynamic-strategy-architecture-transition-plan.md` and remove AdminModule <- StrategyModule runtime coupling by moving `strategy/join` contribution creation into `StrategyController`
- Add shared `StrategyConfigResolverService` and `StrategyRuntimeDispatcherService`, and wire admin strategy instance start/validate/stop plus `start_mm` dispatch through shared resolver/dispatcher paths
- Add `ExecutorOrchestratorService` with `ExecutorAction` model and route strategy intent publishing through orchestrator adapter while keeping existing intent worker/execution pipeline
- Add `decideActions` controller contract and migrate pure market making runtime to controller action emission path with orchestrator-backed intent publish flow
- Route `stop_mm` through shared strategy resolver/dispatcher flow and add execution-category (`clob_cex`/`clob_dex`/`amm_dex`) mapping support in runtime dispatcher for volume start
- Complete controller-decide runtime cutover, add strategy market data provider and AMM swap intent metadata persistence/execution, and add admin strategy definition remove API plus UI action
- Remove StrategyService legacy runtime fallbacks so controller registry + orchestrator are the only strategy runtime execution path, and align start_mm queue flow to shared config resolver validation

## 2026-02-28

- Add dynamic strategy definition architecture (`strategy_definitions`, `strategy_definition_versions`) and instance linkage fields on `strategy_instances`
- Add admin strategy definition lifecycle APIs (create/list/get/update/enable/disable/publish versions)
- Add admin strategy instance APIs (validate/start/stop/list)
- Add legacy strategy instance backfill endpoint
- Add seeded built-in strategy definitions (pure market making, arbitrage, volume) with version snapshots
- Add executor registry abstraction and executor modules for strategy runtime dispatch
- Add admin strategy manage settings page
- Add typed interface helper APIs/tests
- Add migration and transition guides for dynamic strategy cutover under `docs/plans/*`

## 2026-02-27

- Harden pause-withdraw orchestration with durable pending/completed/failed intents and idempotent ledger rollback on external withdrawal failure
- Gate reward vault transfer by durability idempotency check before external send and require marker write success before transferred status
- Fix Arbitrum/OP/Litecoin chain UUID mappings in network mapping service using current Mixin chain metadata
- Fix review findings: protect pending-intent append with rollback path, add deterministic withdrawal request key, fail CANCEL_ORDER without mixinOrderId, and enforce share-ledger idempotency key uniqueness

## 2026-02-20

- Add shared DaisyUI theme files for main/admin UI and map admin routes to dedicated admin theme tokens
- Refresh ui/DESIGN_PATTERN.md to match current theme files, typography, and layout wiring
- Localize hardcoded HuFi empty-state text in market-making pages with en/zh i18n keys
- Remove custom add mode from market-making pair dialog and simplify quick-add search/result UI
- Align spot-trading quick-add dialog inner content with market-making quick-add and unify dialog backdrop behavior
- Restore DaisyUI default semantic status colors and depth/border tokens in custom themes to recover previous badge, border, and shadow appearance
- Rework admin /manage dashboard to a TailAdmin-style shell with responsive sidebar drawer, sticky top bar, and refreshed stats/orders/users widgets for desktop and mobile

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
- Fix admin global fee API to read the seeded primary config instead of assuming `config_id = 1`, which made `/manage/settings/fees` show `0` fees
