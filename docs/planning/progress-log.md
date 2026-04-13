# Execution Flow Changelog

## 2026-04-13

- Guard dual-account volume quotes with pre-quantization exchange min/max checks and let below-min preferred sides fall through to fallback/rebalance instead of surfacing CCXT `InvalidOrder` errors
- Add a `750ms` dual-account maker settlement window after the IOC leg: if the maker still looks live after the confirmation check, the runtime now cancels it instead of leaving a stale post-only order blocking later cycles
- Make dual-account volume sizing adapt to live maker/taker balances each tick: the runtime now shrinks oversized cycles down to the currently affordable amount and skips only when the quantized order would fall below exchange minimums
- Make dual-account volume retry the opposite side when the preferred side is not tradable with current balances, while short-circuiting zero-sized post-balance quotes before CCXT precision calls
- Add dual-account local auto-rebalance: when neither normal side is tradable, the strategy now submits a single-account IOC rebalance order that restores the next feasible side without advancing published-cycle counters

## 2026-04-12

- Fix stale market-making runtime recovery after stop/restart: tracker modules now receive `StrategyInstance` and `MarketMakingOrder` repositories, orphan tracked orders can transition from `pending_create` to `cancelled`, and startup restore now refuses order-bound strategy rows whose bound market-making order is no longer `running`
- Fix admin direct order-details inventory skew math: normalize base balances into quote value using the live bid/ask midpoint before rendering the allocation bar, so dual-account XIN/USDT balances no longer compare raw token counts against USDT totals
- Bound market-making exchange adapter calls with a timeout so a hung CCXT request cannot hold the per-exchange queue forever, which previously let one stuck dual-account intent block tracker polling and keep the global tick coordinator in `previous tick is still in progress`

## 2026-04-11

- Realign the admin direct market-making sandbox system spec with the `key_id`-based API key identity cutover by removing the obsolete direct-start `accountLabel` payload field, replacing legacy `exchange_index` fixtures with `key_id`, and documenting a dated dual-account volume release gate checklist
- Add `dualAccountVolume` controller registration to the single-tick system-test helper, add a dedicated dual-account admin-direct sandbox system spec, make admin direct status merge live `strategy_instance.parameters` over the stored snapshot, and fix dual-account published-cycle persistence to preserve execution-written completion counters

## 2026-04-10

- Add short-lived in-memory HuFi access-token caching in `CampaignService` and route admin campaign joined-status reads through the shared token helper to avoid nonce/sign/auth on every admin page refresh

- Make admin direct MM minimum-order handling use real exchange market limits: frontend now resolves live CCXT minimums instead of rendering non-positive `0`, and backend now persists exchange-derived pair limits/precision when admin market-making pairs are added or refreshed
- Rewrite `docs/planning/2026-04-10-api-key-identity-migration-plan.md` into an MVP hard-cutover plan: no old-client compatibility, no old-order/runtime preservation, `key_id` as the sole runtime identity, and a full DB reset + seed deployment assumption
- Close the deferred volume controller follow-up: sanitize volume/dual-account cadence parsing, keep controller rerun compatible with legacy `incrementPercentage` / `intervalTime` / `tradeAmount` keys, and source rerun tenant identity from `StrategyInstance.userId/clientId` instead of persisted params
- Start Phase 0 of `docs/archive/plans/2026-04-09-unified-execution-plan.md`: make exchange execution account-aware by threading `accountLabel` through the connector adapter, PMM runtime balance/rule/restore/cancel paths, tracked-order persistence, and intent execution
- Persist restart-critical strategy intent fields (`accountLabel`, `timeInForce`, `slotKey`, `postOnly`) plus tracked-order account metadata (`accountLabel`, `slotKey`, `role`) with a new nullable migration and unit coverage for adapter, tracker, intent execution/store/worker, and strategy runtime regression paths
- Start Phase 1 of `docs/archive/plans/2026-04-09-unified-execution-plan.md`: switch PMM quote generation to stable `slotKey` targets, split tracker live-vs-active slot queries, rewrite PMM refresh into cancel-first slot reconciliation, and add slot-aware create dedup plus stop-path publish gating
- Start Phase 2 of `docs/archive/plans/2026-04-09-unified-execution-plan.md`: add `dualAccountVolume` runtime/controller plumbing, dual-label readiness gating, maker->taker IOC sequencing, cycle counter persistence, dangling-maker restart cleanup, and dual-account server test coverage
- Start Phase 3 of `docs/archive/plans/2026-04-09-unified-execution-plan.md`: add admin direct dual-account start/list/status support, expose dual-account config in the admin direct MM UI and order details drawer, add PMM slot-reconciliation reason logging (`slot_occupied`, `waiting_cancel`, `within_tolerance`, `insufficient_balance`), and extend targeted backend coverage

## 2026-04-09

- Add a dated PMM minimum-safe-stability close-gap plan in `docs/archive/plans/2026-04-09-pmm-minimum-safe-stability-gap-plan.md`, narrowing the Hummingbot gap list into phased must-have/should-have/recommended work for single-venue PMM safe operation
- Harden PMM runtime recovery and shutdown paths: restore tracked exchange orders on startup via REST open-order reconciliation, cancel orphaned exchange orders, add process-shutdown cancel-all with bounded wait, and add a realized-PnL kill switch with unit coverage
- Route REST-recovered fill deltas back through the executor/ledger path, add mock-system PMM safety coverage for restart/shutdown/disconnect/kill-switch behavior, add mock-system WS/REST fill-recovery dedup coverage, and close the April 9 PMM minimum-safe-stability todo checklist
- Add a new PMM active-order reconciliation design plan plus a follow-up todo checklist to fix remaining Hummingbot-gap behavior around `pending_create` slot occupancy, phased cancel-then-recreate refresh, and stop-path tail-intent races

## 2026-04-08

- Add `min_order_amount`, `max_order_amount`, `amount_significant_figures`, and `price_significant_figures` to grow market-making pairs with a migration, seed population, and shared frontend/backend types

## 2026-04-07

- Route market-making order book tracking through the shared `MarketdataService` stream, add a thin `OrderBookIngestionService` consumer for runtime session start/stop, and log tracker/order-book/ticker fallback reasons so strategy pricing no longer depends on per-tick ticker HTTP requests when websocket books are available
- Add bounded retry/backoff to exchange client initialization so transient `loadMarkets()` failures do not permanently leave an exchange in `failed` state until config changes

## 2026-04-02

- Bind private user-orders reads and market-making intent creation to the authenticated JWT user, add ownership checks for payment/detail lookups, and cover the security change with controller/service unit tests

## 2026-04-02 — Unified Exchange Account Design

- Designed and documented unified `ExchangeAccount` entity to replace `admin_exchanges` + `api_keys_config` split. Root cause: `admin_exchanges.enable` has no runtime effect — CCXT always needs credentials. Saved to `docs/archive/plans/2026-04-02-unified-exchange-account-design.md`, marked as future TODO in `todo.md`.

## 2026-04-01

- Add an English planning note that frames the backend as a `Funding Layer` plus `Execution Layer`, with mixin, manual funding, and EVM wallets treated as funding sources that converge on a shared `ready_to_start` state
- Mark the April 1 funding-layer/execution-layer planning note as a future TODO rather than current implementation scope

## 2026-03-28

- Replace the intent-engine worker-error spec's fixed sleeps with condition-based waits, fix Bun runtime type-only imports in strategy controller modules, and make SQLite system-test entities declare explicit varchar-backed enum/union columns so the in-memory intent lifecycle suite boots and passes again
- Fix private-stream fill routing so tracked-order fallback targets the owning session, convert cumulative `filled` snapshots into positive deltas before ledger mutation, and switch fill-ledger idempotency keys away from unstable `receivedAt`
- Reorganize market-making system specs into `intent-engine/` and `strategy/pure-market-making/`, merge overlapping lifecycle/retry/failure/error and single-tick/multi-layer/cadence suites, drop redundant sandbox intent overlays, and refresh the market-making test operations doc to match the new bounded-context layout
- Document Phase Soak in market-making test operations guide — spec location, tunable parameters, error/fill injection strategy, 12 system invariants table, and production implication

## 2026-03-27

- Add soak stability system test (`pure-market-making-soak.sandbox.system.spec.ts`) — runs N tick cycles with cancel-replace, multi-type error injection (createOrder/cancelOrder/fetchOrderBook), simulated fill ingestion, heap memory tracking, and asserts 12 bounded-resource invariants for long-running stability

## 2026-03-22

- Gate `ExchangeInitService` sandbox bootstrap behind the `test:system` setup path, remove `CCXT_SANDBOX_ENABLED`, and document that only the system-test entry point reads `CCXT_SANDBOX_*`

## 2026-03-21

- Move the completed market-making cycle design, testing checklist, and token metadata migration plan from `docs/planning/` to `docs/archive/plans/`, and refresh the planning README so only active dated plans stay listed there
- Add real coordinator-path system coverage, a private-stream reconnect smoke spec, and multi-pair executor-isolation sandbox coverage, and align the planning todo checklist with the now-completed gap items
- Add reconciliation system coverage, queue-contract coverage for queued payment checks, a rate-limit regression spec for adapter request-chain release after failures, a far-future cadence assertion, and updated planning todo state for the remaining system-test gap plan items
- Refresh the March 20 system-test gap analysis plan so it marks WAL storage, durability coverage, websocket backoff tests, and existing config-schema validation correctly, and retarget the remaining open gaps to coordinator, reconciliation, queue-contract, rate-limit, runtime reconnect, isolation, cadence, and misconfiguration coverage
- Add a dated implementation plan for a persistent sandbox market-making validation runner that starts through the real runtime path, streams live orderbook/open-order/fill observations, persists run metadata, and stages future API/UI monitoring as later phases

## 2026-03-20

- Add a dated system-test gap analysis plan, switch sandbox-heavy system helpers to temp-file SQLite WAL storage, add durability outbox/consumer-receipt system coverage, and surface pending/failed exchange initialization so sandbox tests can wait on real exchange boot deterministically
- Rename market-making system spec files to explicit `.mock.system.spec.ts` and `.sandbox.system.spec.ts` suffixes so both classes still run under the unchanged `test:system` Jest matcher (`*.system.spec.ts`)
- Add sandbox intent parity specs for lifecycle and idempotency, and extend the shared single-tick helper with duplicate stored-intent consumption so real sandbox runs can assert no duplicate persistence side effects
- Improve shared system-test logging so each log line shows the active Jest test name, step index, and pretty-printed payloads to make scope and progress easier to read during long runs

## 2026-03-19

- Rewrite the token metadata service plan into a dated phased-migration doc, rename it to `docs/planning/2026-03-19-token-metadata-service-plan.md`, and scope CoinGecko removal behind explicit list/detail parity gates
- Move `docs/planning/2026-03-18-private-stream-tracker-test-plan.md` to `docs/archive/plans/` after reclassifying it as historical implementation planning rather than an active plan
- Restore date-prefixed filenames for active planning docs under `docs/planning/` and update doc indexes and cross-references to the dated paths
- Rewrite `docs/product/liquidity-layer-technical-implementation.md` into a system-design-constraints doc that separates product thesis from current architecture and clarifies the remaining gaps to a real liquidity layer
- Reorganize `docs/` into product, architecture, operations, roadmap, and archive directories; add a new docs index and retarget doc guidance to the new structure
- Reduce duplication by making `architecture/market-making-flow.md` the detailed market-making source of truth, shortening `architecture/server/business-flows.md` to a server-wide overview, and trimming completed items out of `planning/todo.md`
- Reshape `planning/market-making-testing-checklist.md` into a compact current-status snapshot that points detailed execution work back to the planning docs and sandbox plan
- Rename `docs/roadmap/` to `docs/planning/` so the directory name matches its actual role as the active dated planning area

## 2026-03-18

- Mark the March 18 testnet closed-loop funding E2E task as blocked until the runtime re-enables `withdraw_to_exchange`, stops refund-only validation mode, and wires the broader withdrawal/deposit confirmation path end to end
- Add in-memory worker-error system coverage for pure market-making intent execution and update the March 18 testing checklist to mark the completed onFill, ledger, lifecycle, and error-handling tracks
- Add a sandbox-backed private partial-fill ingestion system spec that verifies deterministic `partially_filled` events update the tracked order state and reach the pooled executor callback
- Add in-memory system coverage for pure market-making intent lifecycle, retry, failure, and idempotency handling, asserting persisted `NEW -> SENT -> DONE` / `FAILED` state changes plus mapping/history side effects
- Add pure market-making `onFill` runtime handling that records fill-driven base/quote ledger adjustments, makes filled sessions immediately eligible for the next tick, and aligns strategy runtime specs with exchange-safe submitted client IDs
- Translate the March 18 market-making testing completion checklist into English and tighten its task ordering and execution wording
- Complete Track B1 business-flow parity with a new payment-intake system helper/spec that covers real order-intent creation, snapshot intake, `payment_complete`, strategy snapshot persistence, and ledger credits
- Complete A7 private-fill parity on the reference exchange by using a second sandbox account as the live counterparty and passing the real `watchOrders()` fill-routing system assertion
- Add optional `CCXT_SANDBOX_ACCOUNT2_*` sandbox config and a conditional dual-account A7 live-fill system-test path so true private-stream fill verification can run when a counterparty testnet account is available
- Wire pure market-making runtime session attach/detach to `PrivateStreamIngestionService`, add watcher refcount/backoff coverage, and carry `accountLabel` on pooled executor sessions for account-safe private-stream routing
- Implement `PrivateStreamTrackerService` exchange-order fallback and account-boundary handling, add passing private-stream unit suites, and add a new A7 `private-fill-ingestion.system.spec.ts` runtime integration spec
- Add a new market-making testing roadmap plan that stages execution-engine parity before the broader business lifecycle, uses checkbox phase gates, and tracks exchange validation with a lightweight capability matrix
- Update `docs/plans/README.md` to index the new March 18 testing roadmap and clarify the March 15 sandbox plan as the detailed Track A execution-engine document
- Clarify in the March 18 testing roadmap that all system-test specs and system-test-only support files should live under `server/test/system`, not under `server/src` or `server/test/helpers`
- Add Track A3 runtime-control system-test coverage under `server/test/system` with a real processor/runtime helper and a passing `market-making.processor.system.spec.ts` start/stop parity suite
- Add split `server/test/system` sandbox helpers for shared config and single-tick runtime setup, plus a capability-aware A4 single-tick system spec that stays skipped on the current binance `clientOrderId` live-placement gap
- Switch live strategy intent execution to exchange-safe submitted `clientOrderId` values while keeping parseable `{orderId}:{seq}` helpers for local routing tests, and pass the A4 single-tick sandbox parity suite on the reference exchange
- Update active market-making docs and `docs/code/server` mirrors to distinguish parseable local `clientOrderId` values from exchange-safe submitted IDs and reflect the completed A4 single-tick sandbox path
- Extend the shared single-tick system helper to build configurable pure market-making fixtures and expose executor-session controls for later Track A parity phases
- Add A5 multi-layer sandbox parity coverage with layered price and quantity assertions plus hanging-order preservation on the next eligible tick
- Add A6 cadence sandbox parity coverage with repeated eligible ticks, stable executor-session reuse, and deterministic submitted `clientOrderId` sequencing
- Move the sandbox order-lifecycle and fill-resolution specs plus their helper under `server/test/system` so system-only files match the March 18 test-placement rule
- Replace the A3 runtime-control helper's mocked strategy config resolver with the real service and record explicit exchange-side evidence in the runtime-control system spec
- Add a new March 18 plan for fully implementing `PrivateStreamTrackerService` with Hummingbot-style private-stream ownership adapted for Mr.Market's multi-account runtime

## 2026-03-17

- Reframe the CCXT sandbox testing plan as a production-parity execution-engine plan that requires the same exchange init and `start_mm` / `stop_mm` runtime paths as mainnet and explicitly gates remaining parity gaps
- Clarify `docs/tests/MARKET_MAKING.md` as documenting the currently implemented sandbox suites only, not the broader production-parity target
- Update `docs/plans/README.md` to describe the March 15 sandbox plan as the production-parity execution-testing source of truth
- Add a bottom-of-plan verification checklist to the March 15 sandbox plan that marks phases 1-4 as verifiable against real testnet orders and keeps private-fill ingestion explicitly gated
- Implement env-driven `CCXT_SANDBOX_*` boot in `ExchangeInitService`, route `sandbox-order-lifecycle.system.spec.ts` through the real exchange-init path, and unref exchange-init background timers so Jest exits cleanly
- Update sandbox env/docs references to include optional `CCXT_SANDBOX_ENABLED` and `CCXT_SANDBOX_ACCOUNT_LABEL` and describe the real ExchangeInitService-backed lifecycle suite

## 2026-03-16

- Refresh `docs/execution` index, ADR wording, and UI token notes to match the current `main` branch structure and theme values
- Rewrite execution-layer memo and network-mapping docs to match the current backend-supported scope, authoritative encode/decode flow, and native-network resolution behavior
- Align market-making and strategy-definition docs with current routes, snapshot guidance, controller/runtime hooks, and source file locations

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

## 2026-04-10

- Derive effective direct-order minimums from live exchange `amount.min` and `cost.min / price`, and surface rounded minimum hints in the admin direct order UI

## 2026-02-06

- Adjust Mixin snapshot polling interval and clarify view-only exchange mode when no API keys

## 2026-02-04

- Add default ceiling/floor price when creating market making orders on payment completion and show payment success dialog after polling
- Store chain metadata for market-making pairs in grow data

## 2026-02-03

- Remove interface-side market making memo generator so intent API remains the memo source of truth
- Add guards and queue alignment for market-making processing (BigNumber import, withdrawal monitor retries, VWAP safety)

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
- Add structured progress logging across system-test suites for clearer execution tracing
- Increase pure market making soak test timeout to 2 hours

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
- Add admin direct market-making flow with shared runtime start/stop, campaign joins, source filtering, and admin monitoring UI
