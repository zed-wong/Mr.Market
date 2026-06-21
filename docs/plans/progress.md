# Execution Flow Changelog

## 2026-06-22

- Start Phase 1 of `docs/plans/2026-06-21-connector-based-dex-clob-architecture-plan.md`: add the unified Connector contract, ConnectorRegistry, and ClobConnector; route CLOB create/cancel exchange mutations through `connector.submitAction` / `cancelAction`; persist optional `connectorId` on strategy intents; keep Hyperliquid/Binance/MEXC on the CLOB connector path; add focused connector and intent-execution regression coverage.
- Continue Phase 1 connector naming cleanup: move `server/src/modules/defi/` into `server/src/modules/market-making/connector/adapters/`, rename the adapter registry/interface to `EvmDexAdapterRegistry` / `EvmDexAdapter`, rename `defi-addresses.ts` to `connector-addresses.ts`, make `ConnectorModule` own the EVM DEX adapter providers, and update server module-map documentation.
- Complete the Phase 1 execution-category rename: replace active `clob_cex` / `amm_dex` usage with connector taxonomy `clob` / `amm`, keep `clob_dex` explicitly rejected, update the volume strategy seed and migration path for persisted strategy definitions, and verify with focused strategy/intent specs plus server build.
- Complete Phase 2 foundation for the connector architecture plan: add `TradingAccount` and `TokenRegistryEntry` entities, migrations, modules, and services; resolve EVM signers from encrypted trading-account private keys by account or purpose; add TokenRegistry asset/native-token resolution; add nullable `tradingAccountId` and `chainId` ledger/balance dimensions plus `externalLocked`; register an `EvmDexConnector` shell for Uniswap/Pancake connectors with explicit not-supported transaction lifecycle semantics until AMM settlement phases; verify with focused connector/ledger/service specs plus server build.
- Complete Phase 3 EVM execution lifecycle foundation: add durable `EvmExecution` records with required nonce, parent/child execution types, gas sponsorship fields, receipt hashes, pending observation blocks, and manual-review reasons; add `NonceAllocatorService`, `GasPriceOracleService`, and `EvmReceiptConfirmerService` with per-chain confirmation policies for Ethereum, BSC, and Polygon; route confirmed, reverted, stuck-pending, and reorg-changed receipts through explicit execution state transitions without generic EVM submit retry; verify with focused EVM execution specs plus server build.

## 2026-06-15

- Archive the completed ledger order/user order identity plan from `docs/plans/` to `docs/archive/plans/`, keeping only the active venue design and admin direct editable volume config plans in current planning.

## 2026-06-14

- Sync the active venue plan terminology to the latest yellowpaper order identity vocabulary: `userOrderId`, `ledgerOrderId`, `accountLabel`, `clientOrderId`, and `exchangeOrderId`, with venue mutation and evidence terms replacing loose exchange/external-order wording.
- Update the active Hyperliquid/AMM/CLMM venue plan after the yellowpaper order identity change: DEX and on-chain execution records now carry `userOrderId`, `ledgerOrderId`, and `accountLabel`, while reservation, settlement, gas, LP, and reconciliation balance effects are keyed by `ledgerOrderId + asset`.
- Complete the market-making order identity cleanup: ledger balances now keep explicit `ledgerOrderId` storage with `userOrderId` and `accountLabel` attribution, dual-account fills/reservations/tracked orders carry that identity end-to-end, order performance aggregates by `userOrderId`, and reconciliation reports scoped mismatches with account attribution.
- Change admin direct resume to reallocate orders against current available exchange balance before runtime start, preserving the original order id while recording allocation shrinkage through typed order-scoped ledger entries.
- Refine efficient dual-account mismatch settlement: exact and small paired-fill differences complete normally, below-exchange-minimum dust is carried without repair, and only material paired-fill mismatches enter repair with an explicit repair context.
- Make efficient dual-account repair context-aware: repair mode first tries a targeted IOC for the exact mismatched account/side/quantity, then falls back to the existing generic rebalance path when targeted repair cannot execute.
- Route efficient dual-account repair states through normal planning before repair: stale below-min repair context is carried and cleared, while states with no executable funding fall through to the classified no-progress guard.
- Add an efficient dual-account no-progress guard: repeated empty runtime decisions are classified through the readiness evaluator and become a `STOP_CONTROLLER` after three matching blockers, while real published-cycle accounting now only counts maker `CREATE_LIMIT_ORDER` actions.

## 2026-06-13

- Add the active yellowpaper-based venue execution plan for Hyperliquid plus AMM/CLMM DEX support: Hyperliquid stays on the CLOB exchange path, Uniswap/PancakeSwap split into AMM swap and CLMM LP paths, on-chain execution becomes receipt-confirmed and order-ledger-attributed, and DEX funding/withdrawal/reconciliation requirements are explicit before user-facing launch.
- Remove the efficient dual-account runtime cycle panel from the admin direct order details account-routing dialog so that routing focuses only on maker/taker account labels.
- Fix efficient dual-account taker-only mismatch recovery: when the inline taker leg fills but the maker leg has zero fill, the settled cycle now enters `paired_fill_mismatch` repair mode, and the optimal planner now attempts an IOC rebalance before returning empty actions when no sustainable candidate has base inventory.
- Fix partial IOC fill settlement without a matched tracked-order snapshot: when the first settlement payload carries `qty` larger than `cumulativeQty`, settlement now caps the delta at cumulative fill so repair rebalance orders do not over-credit inventory and trip reservation mismatch pauses, while normal delta fills keep their original cumulative idempotency key.
- Fix efficient dual-account repair ticks after paired fill mismatches: repair mode now builds IOC rebalance intents from tracked best bid/ask prices instead of passing zero prices to the planner, so strategies no longer remain `running` while returning empty actions after `repairRequired=true`.

## 2026-06-11

- Add an in-doubt create-order path for market-making intent execution: ambiguous placement errors now reconcile by deterministic `clientOrderId` before releasing reservations, unresolved placements persist as `pending_create` tracked orders without generic balance adjustment, and the tracker can recover those orders by client id on later polling.
- Add dual-account immediate cycle outcomes as strategy-scoped runtime observations: safe no-fill and small maker/taker mismatch now complete the maker intent after maker cleanup and feed a dual-account-only soft-failure health counter, while the dual-account controller emits `STOP_CONTROLLER` only after three soft outcomes in the short window; generic runtime pressure and adaptive PMM reject handling remain unaffected.

## 2026-06-08

- Execute the market-making logging normalization plan: add a `CustomLogger.marketMaking()` adapter with `[MM]` structured formatting and rate-limited warnings, then convert executor, balance scheduler, PMM/adaptive quote filtering, user-stream, order-book, runtime timing, and shutdown cleanup logs to the normalized levels.
- Scope reservation-release ledger idempotency keys by `orderId` so admin direct stop-all cleanup cannot collide across order-scoped balances that share an external/client order identifier.
- Scope dangling reservation recovery idempotency keys by the residual recovery content so delete cleanup can safely retry after fills or prior releases change the remaining locked amount.
- Update the admin direct market-making runtime panel for the latest efficient dual-account volume states: recognize efficient/optimal variants, surface latest cycle failures ahead of persisted lifecycle labels, and render newest cycles first.
- Allow admin direct orders whose persisted state is still `running` but whose runtime executor is `gone` to be removed through the normal cleanup path, while still blocking removal when active tracked exchange orders remain.
- Make terminal exchange-order reservation release cleanup skip already-recorded release events instead of recalculating a new amount for the same cancelled order id.
- Harden the admin direct order detail UI: PnL chart now falls back to an empty state for fewer than two valid points, and latest-cycle summaries use compact wrapping labels so long runtime cycle ids do not overflow the card.
- Show the planned inline taker leg in admin direct runtime cycles whenever efficient dual-account maker metadata is present but the taker IOC has not been dispatched yet.
- Default efficient dual-account inline taker dispatch delay to `0ms` so maker-open acknowledgement is followed by the taker IOC without an artificial post-delay window.
- Derive admin direct completed cycle count and traded quote volume from runtime cycle legs so the order details dialog does not keep showing stale `completedCycles=0` while maker/taker legs are actually filled.
- Expose cached exchange trading rules to dual-account runtime planning and block efficient/best-capacity cycles when cached minimum amount/notional rules are missing or when capacity falls below exchange cost minimums, preventing sub-1 USDT MEXC intents from being generated after inventory drains.
- Document the execution boundary cleanup plan and start restoring the intent-worker boundary for strategy-driven exchange cancellation.
- Start the stop-state-machine cleanup: dual-account target completion now emits `STOP_CONTROLLER`, STOP execution marks strategies `stopping` and enqueues `CANCEL_ORDER` intents for live tracked orders, and the intent worker allows STOP/CANCEL while stopping.
- Add the local stop finalizer: once a `stopping` strategy has no active tracked orders and no active intents, strategy tick finalizes it to `stopped` and detaches its session without exchange I/O.
- Remove the strategy stop callback from controller tick context; volume and pure-PMM risk/target stops now emit `STOP_CONTROLLER` actions instead of directly invoking cleanup.

## 2026-06-07

- Clarify the yellowpaper strategy model as the current source of truth: `StrategyDefinition` is the strategy class/product family, `StrategyTemplate` is the reusable parameter preset, and `strategySnapshot` is the immutable runtime config resolved from definition, template, overrides, and runtime fields.
- Add the 48-hour launch core plan around the two product priorities: user-facing adaptive pure PMM for real liquidity and PnL-driven market making, plus user-facing dual-account volume strategy creation for HuFi campaign volume rewards.

## 2026-06-03

- Add the capital-efficient dual-account volume plan as an additive strategy contract: keep `dualAccountVolume` and `dualAccountBestCapacityVolume` separate, and make `efficientDualAccountVolume` the new recommended product path that scores all account-role directions, rotates inventory to minimize capital, exposes readiness/missing-balance diagnostics, and renders maker/taker cycle state clearly.

## 2026-06-02

- Archive completed or superseded active plans for future Web3 endpoints, one-time setup wizard, order-performance PnL, campaign leaderboard, and Web3 wallet/market-making Router implementation so `docs/plans/` stays focused on current work.
- Add the runtime startup/readiness refactor plan: introduce a NestJS-aligned runtime module, move external I/O out of constructors/module-init blockers, expose readiness state, and keep trading safety behind explicit exchange/reconciliation risk gates.
- Move metrics HTTP access behind the authenticated admin surface as `/admin/metrics` and `/admin/metrics/runtime`, removing the public `/metrics` controller while keeping `MetricsService` for dashboard/system-health internals.
- Remove the legacy unauthenticated `/performance/:userId` controller while keeping `PerformanceService` available to the guarded admin and web3 order-performance endpoints.
- Add a follow-up migration that backfills the missing `web3_funding_request.startBlockNumber` column for databases where the funding request table was created before the current entity shape.
- Register `Web3FundingRequest` and `Web3EventLog` in the server TypeORM root entity list so the Router event poller repositories have metadata at runtime.
- Start the Mixin blaze message loop from a deferred background callback so Nest bootstrap is not blocked by Mixin websocket/network startup, while preserving async failure logging for the message handler loop.

## 2026-06-01

- Complete the selected Web3 Router refactor without keeping the old Vault/deposit/withdraw compatibility surface: `MrMarketRouter` replaces `MrMarketVault`, `/web3/funding-requests` owns funding prepare/status/verify, `/web3/withdrawal-requests` owns withdrawal prepare/status/verify, a background Router event poller processes pending funding/withdrawal events through the same idempotent processors as receipt verification, and `web3-interface` now calls Router transactions instead of submitting ordinary transfer hashes.
- Start implementing the selected Web3 Router design: replace the Vault artifact with `MrMarketRouter`, add funding-request and event-log persistence, expose `/web3/funding-requests` prepare/status/verify endpoints, process `FundsRouted` receipt evidence into formal order creation, and switch the web3 order-create submit path to Funding Request First + Router `routeFunds`.
- Add `docs/plans/2026-06-02-web3-router-funding-request-first-design.md` to capture the selected EVM Web3 funding direction: Funding Request First, stateless Router forwarding ERC-20s to the server receiver, server event indexing and order creation, no on-chain orderId/hash, order-scoped ledger entries, and withdrawal fees recovered from order funds.
- Make `GrowdataService` module-init cache warmup non-blocking so Nest can start listening without waiting on CCXT public market loads or Mixin asset price fetches; first grow-data callers still share the in-flight refresh.
- Remove `pair` and `exchangeName` from strategy-definition config schemas/defaults across seed data and add a migration to clean persisted definitions; admin-direct and user order launch paths now inject those values only after schema validation as runtime order fields.
- Reopen the Web3 wallet/market-making plan around the clarified Solidity Router funding design: EVM and SIWE remain first-class, but the vault/REST-withdraw prototype must be refactored so users fund orders by calling a Router that forwards ERC-20s to the static server-held address and emits events, while withdrawals start from Router request events that the server processes from the ledger.
- Remove the remaining `web3-interface` global app login wall: `/app/*` routes now render normally for disconnected/unauthenticated visitors, while expired-session handling and action-level login redirects remain available when a protected API/action actually needs authentication.
- Complete the original Web3 wallet/market-making prototype validation before the Router correction: server full Jest passes, server web3 scoped lint passes, server build passes, `web3-interface` check/unit/build pass, and validation-wallet route smoke on port 5177 covers wallet, deposit, withdraw, and account surfaces.
- Wire the remaining `web3-interface` wallet/account funding surfaces to real web3 APIs, then supersede the ordinary deposit/withdraw endpoints with Router-backed funding and withdrawal request endpoints.
- Add the first authenticated withdrawal prototype, then supersede it with `/web3/withdrawal-requests` prepare/status/verify around Router `WithdrawalRequested` events.
- Add authenticated `/web3/balances`: wallet available balances now come from the web3 wallet ledger projection, in-market-making funds are aggregated by asset from owned order-scoped balances while preserving per-`orderId + assetId` breakdowns, and funding activity is returned from persisted deposit/withdraw ledger entries.
- Add the first ordinary deposit instruction/verify prototype, then supersede it with Router funding-request instructions and event verification.
- Add the initial `MrMarketVault` prototype, then replace it with deployment-agnostic `MrMarketRouter` forwarding semantics and Router ABI/spec coverage.
- Add validation-only market-making order list fixtures in `web3-interface`: authenticated validators can select `validationListState=empty`/`zero` for the empty-order CTA and `validationListState=many`/`compact` for a deterministic five-order compact list while production sessions keep using the real order API.
- Fix `web3-interface` market-making order detail funding asset selection so deposit/withdraw controls load backend pair options, submit Growdata asset IDs such as `asset-btc`/`asset-usdt`, keep human symbols visible as labels, and validate unsupported parsed symbols before calling order funding APIs.
- Redesign `web3-interface` `/app/market-making/order/[id]` detail UX with top lifecycle controls, per-asset order balances, text-only PnL/fees/spread-capture metrics, inline deposit/withdraw validation against order-supported assets and available funds, localized copy, and timestamped event history backed by existing order-level APIs.
- Fix `web3-interface` `/app/market-making/order/new` browser step progression: the create page now drives Pair/Funds/Review panels with explicit `hidden` state instead of Tailwind-only `class:hidden`, tolerates empty amount input on first render, matches selected pair asset IDs to wallet balance symbols, and has focused panel-visibility coverage plus agent-browser proof that pair → funds → review renders the active panel.
- Simplify `web3-interface` `/app/market-making/order/new` into a pure-market-making-only three-step create flow with hidden strategy selection, exchange/pair and funding inputs, balance/over-allocation validation, Reown wallet approval signing before submission, and create API requests tied to the public pure market-making strategy.
- Make `web3-interface` browse-first for `/app/market-making`: the app layout no longer applies the global login wall to the public market-making overview, create-order CTAs route through SIWE with a return path, and private wallet/account/funding/order routes still redirect to login before showing protected data.
- Redesign `web3-interface` `/app/market-making` as the order-management list surface: unauthenticated/connect gating and empty states lead to order creation, small order counts render rich status-first cards, and larger counts render compact rows with PnL/fees, locked funds, and lifecycle actions.
- Add a validation-gated Reown/Wagmi EVM connector for browser SIWE checks: the web3 validation runtime now exposes an automatable local signing wallet only when `PUBLIC_ENABLE_VALIDATION_WALLET=1`, while login still requests `/auth/web3/nonce`, signs through the Wagmi signer, and submits `/auth/web3/login`.
- Set `POST /auth/web3/logout` to return HTTP 200 while preserving its JWT guard and `{ ok: true }` response contract for web3 auth validation.
- Bound admin tracked-order execution enrichment to the current page's internal and exchange order IDs, avoiding unbounded exchange-order mapping expansion that made `/admin/orders?status=filled` exceed SQLite bind-variable limits on high-volume orders.

## 2026-05-31

- Wire real `web3-interface` SIWE auth: protected `/app/*` routes now validate stored JWTs through `/auth/web3/session`, login requests `/auth/web3/nonce` and signs the SIWE message through the Reown/Wagmi wallet signer before persisting `/auth/web3/login` JWTs, logout clears backend/local auth state, and invalid sessions show a re-sign path.
- Add generic order-level performance/PnL reporting: `PerformanceService` now replays order-scoped ledger fill and fee entries into realized, fee, net, volume, effective-spread, and chart series data; web3 user and admin endpoints expose the same calculation with caller-side ownership boundaries; admin direct order details render the ledger-derived PnL chart without a charting dependency.
- Simplify the admin `/setup` wizard around required initialization only: remove API-key, custom config, Mixin, and Web3 capture from setup; gate frontend and backend completion on password/exchange/seed readiness; show seed check counts; and add a post-setup API-key reminder.
- Fix a tracked-order reconciliation race where an exchange open-order snapshot could create an `internal_missing` placeholder before the local create ACK upsert arrived; `internal_missing` can now be adopted by the real order state instead of permanently hiding the order under an orphan placeholder.
- Make pure market-making tick pricing tracked-only: PMM quote decisions now use tracked reference-price snapshots, check both oracle/reference and execution book freshness, and enter cancel-only risk-off instead of calling connector order-book or ticker fallback from the tick path.

## 2026-05-29

- Remove the market-making intent sync execution driver: strategy ticks now only persist intents, worker execution is the sole mutation path, and the `MARKET_MAKING_INTENT_EXECUTION_DRIVER` env/config path is gone.
- 2026-05-29  strategy-service-refactor  Phase 1-4 done — reduced `StrategyService` from ~9.2k lines to 785-line coordinator by moving action building, runtime lifecycle, recovery, settlement, quote planning, adaptive PMM state, dual-account planning, watcher management, order-scoped balance reads, tracked-order shutdown, and kill-switch decisions into owning services/controllers.
- Continue the StrategyService dual-account refactor by moving publish-state calculation plus fill-progress, matched-cycle, settled-cycle, and fill-runtime merge logic into `DualAccountPlannerService`, leaving StrategyService with session/repository/persistence coordination wrappers.
- Make terminal tracked-order reservation cleanup idempotent on server restart by releasing only current order-asset locked funds and skipping already-unlocked terminal rows without warning.
- 2026-05-29  strategy-service-refactor  Phase 1/3 partial — moved limit-order intent construction, latest-intent caching, PnL/markout observation, and PMM kill-switch evaluation out of `StrategyService` into existing intent/observation services plus `KillSwitchService`.
- 2026-05-29  strategy-service-refactor  Phase 1 partial — moved mapped-open-order restoration and interrupted cancel recovery out of `StrategyService` into `StrategyStartupRecoveryService`, keeping startup blocking decisions in the coordinator.
- Harden pure market-making startup recovery: exchange open-order fetch failure now blocks session activation, interrupted create intents are reconciled one-by-one, mapped open orders are restored with slot/price/qty metadata instead of cancelled as orphans, and interrupted cancel intents are retried or reconciled before ticks resume.

## 2026-05-28

- Harden market-making fill settlement around partial fills: tracked exchange orders now persist `settledFilledQty`, runtime fill handling converts user-stream/REST cumulative fills into unsettled deltas before ledger mutation, repeated or lower cumulative events are ignored, settlement conflicts pause the affected order-asset reservation path, and terminal reservation release continues to release only the unfilled remainder.
- Remove bootstrap dotenv override envs (`MR_MARKET_DISABLE_DOTENV`, `DOTENV_CONFIG_PATH`) so backend startup uses the default `.env` load path consistently.
- Centralize remaining backend env access by isolating bootstrap-only dotenv controls, moving CoinGecko/Web3/setup runtime reads through ConfigService, reading the listen port from ConfigModule, and correcting `RUN_STRATEGY_FOR_MIXIN_ORDERS`.
- Consolidate backend runtime configuration by routing Redis through `REDIS_URL`, sharing HTTP/WebSocket CORS policy from ConfigModule-backed CORS config, and moving logger webhooks behind ConfigModule initialization.
- Remove legacy production exchange API-key env loading and sandbox-env bootstrap: exchange initialization now uses DB-backed API keys only, and validation fixtures are test-only without an env escape hatch.
- Remove admin password complexity and minimum-length enforcement from the `admin-interface` password update screen and backend password setup/update services, leaving only password confirmation in the UI and backend persistence/session invalidation on submit.
- Harden admin-direct pure market-making restart recovery: hydrate terminal tracked orders through idempotent reservation release, recover interrupted `SENT`/`ACKED` create intents with no exchange order id by cancelling the stale intent and releasing its order-scoped reservation when no owned open exchange order exists, and make exchange-ready activation awaitable instead of fire-and-forget.

## 2026-05-25

- Start implementing `docs/plans/one-time-setup-wizard.md`: add server setup state persistence/endpoints/middleware and replace the admin `/setup` readiness dashboard with a pre-auth setup wizard that configures password, exchange/API key steps, optional env/config writes, seed status, completion, sidebar hiding, and dashboard continuation prompt.
- Move setup-entered env-style config into `SetupConfigEntity`: setup now stores admin password as a hash plus Mixin/Web3/CoinGecko/Discord/Reward values in DB-backed setup config, encrypting sensitive values where an encryption key is available and applying values to runtime config instead of persisting setup values back to `.env`.

## 2026-05-22

- Fix PMM executable quote checks to use order-scoped ledger available balances when `marketMakingOrderId` is present, and keep PMM spread floors/trading rules tied to ccxt market maker/taker fee data without exchange-specific overrides.
- Fix tracked-order terminal merge so cancelled/filled updates that omit usable price or quantity preserve the existing tracked order values before releasing order-scoped reservations.

## 2026-05-21

- Start Phase 0 of `docs/plans/2026-05-21-adaptive-pmm-plan.md`: keep adaptive PMM market signals as optional tracked-data primitives by recording accepted order-book mid-price history, exposing tracked-only reference price snapshots, microprice, depth imbalance, and realized volatility through the strategy market-data provider, and adding focused coverage that these signal reads do not call connector/ticker fallback paths.
- Continue adaptive PMM Phase 0/1: add the unified `AdaptivePmmSignalSnapshot` with fresh / soft-stale / hard-stale states and market-crash detection, preserve `MICROPRICE` through strategy snapshots and schema, and wire optional volatility-based spread widening into the PMM quote builder while leaving default PMM behavior unchanged.
- Continue adaptive PMM Phase 2: route `MICROPRICE` through the existing price-source path and wire smoothed order-book imbalance into PMM spread asymmetry, with depth-notional gating for thin books and inventory-severe suppression so imbalance cannot override a large inventory skew.
- Continue adaptive PMM Phase 3: add a non-creating order-balance read on `BalanceLedgerService` and use order-scoped base/quote ledger totals to calculate PMM inventory ratio before quote building, falling back to configured `currentBaseRatio` only when the ledger ratio cannot be derived.
- Continue adaptive PMM Phase 4: add optional volatility and inventory-driven quote-size reduction, cap layers during volatile periods, force single-layer PMM when side budgets are below `layeringMinBudgetMultiple × minOrderNotional`, and include quantity drift in quote-refresh tolerance checks.
- Continue adaptive PMM Phase 5: update pure-PMM session cadence from realized volatility when adaptive refresh is enabled, and throttle emitted cancel intents with a per-strategy per-second cancel budget.
- Continue adaptive PMM Phase 6: add an optional PMM markout observation service that records fills, evaluates adverse mid-price movement from cached mid history, maintains per-side toxicity state, and lets PMM widen, shrink, or pause the toxic side without changing fill settlement or ledger semantics.
- Continue adaptive PMM safety/Phase 7 groundwork: wire adaptive PMM signal freshness and crash state into the controller path so unsafe tracked market data cancels live PMM orders without creating new exposure, and emit structured `adaptive_pmm.decision` snapshots with signal, toxicity, layer, and action context.
- Continue adaptive PMM warmup: when configured warmup windows are active or tracked signal samples are still insufficient, force PMM into conservative one-layer quoting with wider spreads and reduced size, while suppressing volatility and imbalance inputs that could otherwise make recovery more aggressive.
- Continue adaptive PMM side recovery: retain per-side cooldown expiry from markout toxicity and, after cooldown ends, linearly restore only that side by applying temporary extra spread and size reduction until the configured recovery window has elapsed.
- Continue adaptive PMM runtime observation: add an in-memory observation service for intent failures, record reject / post-only reject / rate-limit pressure from the execution path, and let PMM temporarily widen spreads or slow cadence from recent pressure without changing execution, reservation, or ledger semantics.
- Continue adaptive PMM Phase 7: persist structured `adaptive_pmm.decision` snapshots into `StrategyExecutionHistory.metadata` on a fire-and-forget path, keeping tick decisions explainable without blocking quote generation on history writes.
- Continue adaptive PMM risk gating: expose the ledger reservation pause state as a read-only check and make PMM cancel existing live orders without creating new ones when order-scoped reservation is paused after a balance/reconciliation mismatch.
- Extend PMM mock-system coverage for adaptive behavior: assert stale tracked market data blocks new PMM creates while emitting cancel intents, and assert volatility signals widen spreads and reduce quote sizes through the runtime quote path.
- Extend adaptive PMM mock-system scenario coverage for toxicity and runtime pressure: assert markout cooldown suppresses only the toxic side, and recent post-only reject pressure widens PMM spreads without changing the execution layer.
- Extend adaptive PMM mock-system scenario coverage for signal precedence and budget gates: assert positive imbalance skews buy/sell quotes in the intended direction, severe inventory deviation suppresses imbalance, thin signal history enters conservative warmup, and small budgets force single-layer quoting.
- Add a short adaptive PMM mock-system soak that cycles through fresh volatility/imbalance, thin-history warmup, and stale-data states, asserting action counts stay bounded and stale ticks never create new orders.
- Document the adaptive PMM architecture after implementation: add `docs/architecture/strategies/adaptive-pmm.md` for signal/observation/decision boundaries and update `docs/architecture/market-making-flow.md` with the adaptive PMM runtime path while preserving intent, ledger, reservation, and execution semantics.
- Close the adaptive PMM inventory extreme gate from the plan: add optional `inventoryPauseSidePivot` support so extreme order-scoped inventory deviation can omit the side that would worsen inventory, with schema/default wiring and quote-manager coverage.
- Tighten the market-crash safety default so `marketCrashBps: 0` disables the crash gate instead of treating any nonzero mid-price movement as a crash, with provider coverage for the disabled default.
- Add an adaptive PMM scenario coverage matrix for all 21 planned market states and expand the mock-system soak to a logical 30-minute, 180-tick run that cycles the plan-required scenarios 1, 3, 6, 7, 11, and 18.
- Add a resident adaptive PMM soak system spec under `strategy/soak/` so `bun run test:soak` keeps one PMM `StrategyService` / `ExchangePairExecutor` / session alive for the configured wall-clock duration, rotates adaptive market states, and asserts bounded actions plus no stale creates without restarting the runtime per iteration.
- Audit and tighten the `admin-interface` passkey chain: confirm frontend helpers call `/auth/passkeys/*`, verify server wiring through `AuthModule`/migrations, mark admin JWTs with `authMethod`, require password-authenticated tokens for passkey registration, throttle passkey login endpoints, allow comma-separated passkey origins with local 5173/5174 defaults, derive passkey origin/RP ID from `CORS_ORIGIN` when passkey-specific config is absent, map WebAuthn verification failures to 401, and add focused auth service coverage for registration gating plus passkey JWT issuance.
- Migrate the legacy admin direct market-making workspace into `admin-interface` as `/trading/direct-market-making`, including direct orders, campaigns, API-key/wallet panels, order details, start/stop/resume/remove flows, and adaptive pure-PMM schema overrides in the create-order modal.
- Tighten admin direct market-making remove semantics so removal first cancels any active tracked exchange orders through the shared runtime stop path, releases order-scoped reservations via ledger unlock/recovery entries, and only archives the order after active tracked orders are gone.
- Add a database migration that patches existing seeded `pure_market_making` strategy definitions with the adaptive PMM schema/default fields and `admin_direct_mm` launch capability, so deployed databases do not depend on rerunning the seeder to expose adaptive PMM in `admin-interface`.
- Reduce `/grow/info` latency by parallelizing its independent data reads, resolving market-making exchange metadata in one pass instead of loading the same CCXT markets twice per exchange, warming the assembled response on module init, and refreshing the prepared local snapshot from a scheduled background job so API reads stay fast.
- Prune stale server architecture docs by deleting the superseded user-stream model/runbook pages, merging the still-relevant user-stream operating modes into `docs/architecture/market-making-flow.md`, and refreshing the server module/flow indexes so they no longer mention removed modules or the obsolete balance event contract.
- Refresh `docs/architecture/market-making-flow.md` against the current yellowpaper-aligned runtime: document order-scoped ledger/reservation, live withdrawal queueing, admin-direct startup, private-stream recovery modes, fill settlement, reconciliation behavior, and the actual submitted client-order-id format.

## 2026-05-14

- Reprioritize `admin-interface/` navigation: Funding and Scheduling routes remain documented as deferred families, while the first admin build focuses on non-Funding/non-Scheduling sections — Overview (`/`, `/overview/status`, `/overview/capital`, `/overview/actions`, `/overview/risks`), Trading (`/trading/routes`, `/trading/strategies`, `/trading/runs`, `/trading/market-making`, `/trading/positions`), and System (`/system/logs`, `/system/users`, `/system/roles`, `/system/api-keys`, `/system/config`, `/system/audit`). Update `admin-interface/DESIGN.md`, sidebar nav metadata, and en/zh nav i18n accordingly.
- Start a separate `landing-interface/` app for the public landing + leaderboard surface, matching `docs/plans/2026-05-10-multichain-interface-restructure.md`'s plan to keep `web/` separate from the existing Mixin `interface/`. The first static version uses a light "Minimal Liquidity Ledger" direction inspired by Titan / Acctual / Shares, with orderbook depth, bid/ask spread, maker leaderboard, campaign rewards, and mechanism copy grounded in the yellowpaper's ledger-first, reservation-before-external-order architecture.
- Merge the public landing surface into `web3-interface/` as the default unified frontend: marketing routes now serve from `/`, `/offerings`, `/architecture`, and `/leaderboard`, while the wallet/app routes live under `/app/*`; the obsolete standalone `landing-interface/` app is removed.

## 2026-05-12

- Add `docs/plans/2026-05-12-may-mainline-action-plan.md` as the May mainline umbrella action plan: organizes the funding / scheduling / execution priorities into P0 inventory & decision closure → P1 design hardening (`vault.md`, `web3-deposit-indexer.md`, `web3-withdraw.md`, `scheduler-observability.md`, EVM asset resolution) → P2 admin observability skeletons (`/chains`, `/workers`, `/reconciliation`) + web3 SPA shell + `web/` landing & leaderboard contract → P3 EVM funding + scheduling integration (`MrMarketVault.sol`, `modules/auth/web3/**`, deposit indexer, server-mediated withdraw worker, EVM funding adapter on existing intent worker, reconciliation gate) → P4 execution robustness (reservation 8-invariant audit, exchange error normalization, mm-soak long-run tests, admin order four-pane view) → P5 cutover/launch (admin cutover, landing, leaderboard API, web3 Sepolia preview, runbook). Includes workstream split, EVM deposit/withdraw/scheduler-job/order-lifecycle state machines, decision log (D-01..D-14 incl. mainnet/audit/owner/`mm-soak` CI gating/EVM auto-attribution), risk register, testing strategy, rollout plan, daily checklist, dependency matrix on existing admin/web3 plans, and an identified-gaps section flagging that `2026-05-04-yellowpaper-implementation-plan.md` is archived under `docs/archive/plans/` and may need an active summary/index.

## 2026-05-11

- Add `docs/plans/2026-05-11-web3-interface-ui.md` designing the `web3-interface/` UI: mobile-first shell (sticky TopBar with logo/chain pill/theme toggle/Reown connect button + 5-tab BottomNav for home/market/market-making/wallet/account, hidden on `/login`), four-state auth gating in `+layout.svelte` (disconnected → /login full-screen card with connect + SIWE + wrong-network swap, signed-in app, session-expired modal), per-page wireframes for home (portfolio summary + quick actions + campaigns + activity), market (search + tabs + virtualized list + drawer details), market-making (campaigns / my positions tabs with join sheet + claim/leave), wallet list + nested deposit/withdraw flows (deposit step list with broadcast → confirmations → ledger credit; withdraw form → confirm modal → status with reversal-on-failure copy), account (address + session + theme/locale + sign-out + disabled link-mixin row), shared component inventory mapped to daisyUI classes, Reown ↔ daisyUI theme variable mapping, mandatory loading/empty/error/loaded state coverage, motion/feedback rules, en+zh i18n key namespacing, accessibility pass, and a UI build order aligned 1:1 with the engineering phases in `2026-05-11-web3-interface-design.md`.
- Revise `docs/plans/2026-05-11-web3-interface-design.md` per scope decisions: wallet stack switched to **Reown AppKit** (`@reown/appkit` + `@reown/appkit-adapter-wagmi` + viem); auth lives under `modules/auth/web3/` with a `chain_namespace`-discriminated `web3_user` table and a verifier registry so SVM (or any non-EVM) can plug in as a sibling without rewrites; first chain pinned to **Ethereum mainnet** (Sepolia for E2E); vault simplified to v1 single-admin `MrMarketVault.sol` (no multisig, no on-chain whitelist, no `pause()`, no on-chain withdraw queue) — admin can `adminWithdraw` for market making and `userPayout`/`adminRefund` for user withdrawals; user withdraws are server-mediated (`POST /web3/withdraw` debits ledger first, then admin pays out); other chains, multisig, identity linking, multi-instance, and `/market` polish explicitly deferred.
- Add `docs/plans/2026-05-11-web3-interface-design.md` designing the new independent `web3-interface/` SPA (Svelte 5 runes + SvelteKit + Tailwind v4 / daisyUI v5 + bun), SIWE auth flow with 7-day Bearer JWT, on-chain `MrMarketVault` contract, deposit/withdraw indexer with idempotent ledger writes, EVM funding adapter for the existing intent worker, phased rollout (auth shell → deposit → withdraw → market making → audit prep → cutover to `web3.mrmarket.one`), and yellowpaper-compliant invariants.
- Working on `docs/plans/2026-05-11-admin-interface-extraction.md` through Phase 4: align admin auth to 7-day localStorage Bearer JWT plus global admin token version revocation and passkey login, migrate old admin pages into `admin-interface/`, and add unit/e2e coverage before cutover/deploy work.
- Complete Phase 4 first pass for `docs/plans/2026-05-11-admin-interface-extraction.md`: backend admin auth now covers 7-day Bearer JWT, global token-version revocation, lockout/audit scaffolding, session/logout, and `/auth/passkeys/*`; the independent `admin-interface/` has migrated admin routes, Bearer-token API helpers, passkey login/register UI, unit coverage for auth API client/encryption helpers, and Playwright mocked-login smoke tests. Validation is green for server auth tests plus admin `check`, `build`, `test:unit`, and `test:e2e`; copied legacy admin pages still carry warning-level a11y/self-closing diagnostics for follow-up cleanup.
- Continue Phase 2 of `docs/plans/2026-05-11-admin-interface-extraction.md` (frontend half): add lazy `getMrmBackendUrl()` constants reader (`PUBLIC_MRM_BACKEND_URL`, fail fast on first use), `apiFetch` wrapper with `credentials: 'include'`, automatic `X-CSRF-Token` header for unsafe methods, and 401/419 → `showSessionExpired` handling; `auth.ts` helpers for `login` / `checkSession` / `logout` / `loadCsrfToken`; `auth` and `theme` (admin-only `admin-dark-theme` localStorage key) stores; `toAdminTheme()` plus `data-theme` binding on `<html>`; Svelte 5 runes `Sidebar` / `TopBar` / `SessionExpiredDialog` / `LoginCard` shell components driving the 11-entry nav; `+layout.svelte` boot sequence (init i18n → `checkSession` → redirect unauthenticated to `/login`, authenticated away from `/login`) with sidebar gate and global session-expired modal; dedicated `/login` route; placeholder `/` dashboard; expanded `en/zh` admin i18n key set; `bun run check` and `bun run build` green with and without `PUBLIC_MRM_BACKEND_URL`. Backend cookie auth / CSRF / lockout / audit endpoints remain TODO under server scope.
- Start Phase 1 of `docs/plans/2026-05-11-admin-interface-extraction.md`: scaffold new independent `admin-interface/` SPA on Svelte 5 runes + SvelteKit 2.59 + `@sveltejs/adapter-static` (`fallback: index.html`) + Tailwind v4 + daisyUI v5 + svelte-i18n + bun, with `ssr=false`/`prerender=false`/`trailingSlash='never'` layout, trimmed admin-only daisyUI theme (`admin-light`/`admin-dark`), `admin-locale` localStorage key for i18n, and a placeholder root route rendering the `admin.title` i18n key; `bun install`, `bun run check`, and `bun run build` all green; no changes under `interface/`.
- Add `docs/plans/2026-05-11-admin-interface-extraction.md` to plan extracting `interface/src/routes/(bottomNav)/(admin)/manage/**` into a new independent `admin-interface/` app on Svelte 5 + latest SvelteKit + Tailwind v4 / daisyUI v5 + bun, with phased shell/auth/page migration, CORS/i18n/theme considerations, verification commands, and explicit cutover criteria; existing admin routes in `interface/` are preserved until cutover.

## 2026-05-04

- Tighten yellowpaper validation fixes: reward allocations now carry real `orderId` attribution instead of crediting campaign ids as order balances, oracle reward corrections are cumulative and linked to the original reward fact, fill/trade reconciliation checks every fill ref with bounded private trade fetches and pauses affected reservations on unresolved evidence, and Mixin withdrawal completion now requires confirmed snapshot evidence plus an on-chain transaction hash.
- Close Phase 7 validation gaps from the yellowpaper plan: add private-trade-backed fill ledger reconciliation via `fetchMyTrades`, and record changed oracle payout evidence as separate correction reward ledger facts without rewriting credited allocations.
- Close the remaining Phase 7 checklist items in `docs/plans/2026-05-04-yellowpaper-implementation-plan.md` against existing verified paths: private trade/recovered fill reconciliation, ledger idempotency mismatch rejection instead of rewrites, and reversal/rebuild coverage.
- Add Phase 7 reward oracle evidence coverage for `docs/plans/2026-05-04-yellowpaper-implementation-plan.md`: observed rewards confirm only from successful chain receipts, while missing or failed receipts leave the reward pending.
- Add Phase 7 withdrawal reconciliation coverage for `docs/plans/2026-05-04-yellowpaper-implementation-plan.md`: Mixin snapshot evidence now has tests for `sent -> confirmed`, `confirmed -> completed` with on-chain tx id capture, and blockchain failure marking.
- Extend Phase 7 tracked-order reconciliation for `docs/plans/2026-05-04-yellowpaper-implementation-plan.md`: compare off-tick open-order snapshots against internal tracker state, create `internal_missing` placeholders for external-only open orders, and mark internal-only open orders as `external_missing`.
- Start Phase 7 reconciliation/audit work for `docs/plans/2026-05-04-yellowpaper-implementation-plan.md`: emit typed reconciliation audit events for automatic estimated-fee reversals, preserving correction `refType`, `refId`, and reversal evidence.
- Complete Phase 6 reward allocation coverage for `docs/plans/2026-05-04-yellowpaper-implementation-plan.md`: add quote-fill-volume reward scoring from attributable `market_making_fill` ledger entries, exclude missing attribution from score, and add reconciliation coverage that flags missing fill attribution.
- Continue Phase 6 of `docs/plans/2026-05-04-yellowpaper-implementation-plan.md`: persist reward platform fees and undistributed remainders, keep reward allocation accounting equal to gross payout, make existing reward allocations immutable on replay, and extend reward reconciliation/tests around the full allocation invariant.
- Implement Phase 1 of `docs/plans/2026-05-04-yellowpaper-implementation-plan.md`: replace pooled market-making balances with `MarketMakingOrderBalance(orderId, assetId)`, add `orderId`, `idempotencyContentHash`, and `reversalOf` to `LedgerEntry`, move ledger mutation commands to order-scoped keys, reject mismatched idempotency replays, wire deposit credits to the specific market-making order, add ledger rebuild/mismatch reservation pause support, and cover the order-scoped ledger behavior with focused unit tests.
- Start Phase 2 reservation enforcement from the same plan: add `OrderReservationService`, reserve buy quote/sell base funds through `reserve_lock` before `CREATE_LIMIT_ORDER` exchange placement, bind the reservation to `StrategyOrderIntentEntity.intentId`, and release the reservation if exchange create fails before an external order is acknowledged.
- Extend Phase 2 reservation handling so final cancel acknowledgements release the unfilled reservation remainder with idempotent release keys, and negative `fill_settle` ledger entries consume locked funds instead of directly spending available balance.
- Add a reservation recovery scan that aggregates active `reserve_lock` facts from the ledger, keeps reservations with live intents or open order ids, and idempotently releases clearly dangling reservations.
- Complete the first-pass Phase 2 reservation release cases by treating rejected/expired/cancelled create acknowledgements as failed intents, tracking the terminal order state, and releasing the reserved funds before surfacing the failure.
- Start Phase 3 worker integration by partitioning intent mutation lanes by `exchange + accountLabel + pair + mutationType` instead of exchange only, preserving per-strategy serial execution while allowing independent account/pair/mutation lanes to run in parallel.
- Add the first explicit Phase 3 pre-reservation risk gate for create intents: invalid exchange/pair/side/quantity/price now fails the intent before reservation or exchange placement.
- Extend the Phase 3 risk gate to check known market-making order state before reservation; paused/stopped/non-running order-bound create intents fail before any balance lock or exchange call.
- Complete the Phase 3 create-intent risk gate by rejecting stale cached market data and unhealthy API keys before reservation: tracked order books must be fresh, API keys must match the exchange, have `read-trade` permission, and carry `valid` validation status before an exchange order can be placed.
- Start Phase 4 fill/fee settlement by carrying CCXT trade fee cost/currency through user-stream normalization and fill routing, then applying an idempotent `fee_debit` ledger entry alongside the existing `fill_settle` base/quote movement when actual exchange fee data is present.
- Add ledger coverage for full fill settlement: a fully filled buy now has test evidence that locked quote is fully consumed and received base is credited to the same order balance.
- Emit a typed `fill.manual-review` runtime event for orphaned/unresolved fills so missing order mappings go to explicit manual review without mutating ambiguous balances.
- Keep fill base/quote settlement stable when actual fee debit cannot be applied: fee debit failures now log manual-review evidence instead of causing fill replay against already-mutated ledger entries.
- Extract fill ledger mutation into `FillSettlementService` so user-stream and REST-recovered fills share one settlement boundary for base/quote movement and actual fee debit.
- Add PMM fill coverage for per-order realized PnL: a buy followed by a higher sell now records realized quote PnL, resets inventory, and persists the values on the order-bound strategy session params.
- Add reconciliation coverage for estimated fee aging: `market_making_estimated_fee` debits older than the accepted 15-minute threshold now count as reconciliation violations for manual review.
- Accept the `docs/plans/2026-05-04-yellowpaper-implementation-plan.md` Phase 0 decisions: first rollout targets admin-direct market-making, dev/local DB hard-cut is allowed, production migration is deferred until hard-cut completion, internal score starts as eligible fill quote volume, estimated fee reconciliation threshold is 15 minutes, strategy snapshots use canonical JSON plus `configHash`, rate limits partition by exchange/API key/pair/mutation type, and fill fanout uses `MarketMakingEventBus` plus durable outbox.
- Archive `docs/plans/2026-04-26-improve-architecture-plan.md` to `docs/archive/plans/2026-04-26-improve-architecture-plan.md` because `docs/plans/2026-05-04-yellowpaper-implementation-plan.md` supersedes it for implementation sequencing while preserving it as architecture background.
- Add `docs/plans/2026-05-04-yellowpaper-implementation-plan.md` as the execution plan for the yellowpaper: close open technical decisions first, then phase implementation through order-scoped ledger, reservation, intent execution, fill/fee settlement, funding lifecycle, rewards, and reconciliation.
- Clarify the yellowpaper funding-layer asset identity boundary: Mixin is the current primary asset directory and funding entry, CCXT is exchange capability/metadata translation rather than the asset source of truth, and future EVM/Solana entries must map into Mixin or canonical asset identity before entering OrderBalance.
- Reframe yellowpaper reservation as a required order-level locking invariant rather than a mandatory standalone table: MVP can express it through ledger reserve entries plus intent/tracked-order references, while keeping active-lock recovery, release, settlement, and audit rules explicit.

## 2026-04-29

- Parallelize pooled exchange:pair executor ticks and batch strategy intent persistence from the orchestrator path, so one strategy tick no longer serially waits on each active executor and each action batch only enters the intent store once.
- Remove high-confidence backend dead code: deprecated loop-based time-indicator strategy service, orphan campaign sync/score services, unused signal/spot-check/DEX-pricing helpers, unused snapshots/health fixtures, and production-src test fixtures now inlined into their specs.
- Remove low-risk backend local dead code: unused controller/service loggers, stale constructor-injected fields, unused market-data/fee/tracker locals, and wire snapshot failed-job cleanup to its existing retention constant.
- Remove selected backend cleanup leftovers: admin direct display-label helper, admin strategy legacy start fallback and unused performance injection, health API-key startup stub, plaintext API-key decrypt fallback, and unused spec locals.

## 2026-04-27

- Update `docs/plans/2026-04-26-improve-architecture-plan.md` with the market-making bounded-context type ownership policy: new market-making statuses and contracts belong under `server/src/common/types/market-making/`, while `server/src/common/types/orders/` remains only for genuinely generic cross-product order types or temporary compatibility exports.

## 2026-04-24

- Add `docs/product/hufi-whitepaper-source-of-truth.md` as the source-of-truth design frame for the HuFi whitepaper, founder-funded campaign model, guided-vs-advanced product decision, instance/strategy ownership model, HuFi 100 research agenda, stablecoin research agenda, roadmap boundaries, and claims discipline.

## 2026-04-18

- Add campaign filter dialog to HuFi campaigns page: filter by campaign type, sort by start date or reward amount (ASC/DESC), with filter button at top of campaign list and i18n support for en/zh
- Add campaign types section to HuFi learn-more page introducing Market Making, Threshold, and Holding campaign types with card-based layout
- Add campaign-type-specific actions in campaign detail page: show type-specific target info (volume/balance/threshold) in dialog and type-aware button labels
- Add search and exchange filter to admin manage market-making pairs and spot-trading pairs lists
- Tighten dual-account paired execution so the taker cannot blindly hit third-party liquidity after maker ACK: wait for the maker order to become open/unfilled, require it to still own the full top-of-book level at its price, optionally jitter taker dispatch by up to `1s`, revalidate before sending the taker IOC, and fail the cycle with maker cancel if paired-fill validation does not show matching maker/taker fills
- Fix MEXC private-trade fill routing for CCXT unified trade payloads: treat trade `order` as the tracked `exchangeOrderId` instead of falling back to trade `id`, update user-stream fallback extraction accordingly, and add regression coverage so `...X1` trade ids no longer become orphaned unresolved-order fills
- Switch dual-account paired execution back to maker-ack-driven taker dispatch: `StrategyIntentExecutionService` now submits the taker IOC immediately after maker ACK, best-effort cancels the maker leg if that taker submission fails, and dual-account fill routing now uses private-stream maker fills for progress accounting instead of triggering new taker intents
- Finish the 2026-04-18 Hummingbot-style runtime refactor plan: strategy session ticks now enforce cached-state-only balance reads, non-fill order-state updates apply immediately from the user stream, REST order polling moved to `ExchangeOrderReconciliationRunner`, balance refresh moved to `BalanceRefreshScheduler` driven by `balance.stale` / `stream.health-changed`, and connector-scoped runtime lookup now lives behind `ExchangeConnectorRegistry` plus exchange-filtered event subscriptions
- Start Phase 1 of `docs/planning/2026-04-18-market-making-runtime-hummingbot-style-refactor-plan.md`: add a typed `MarketMakingEventBus`, add a shared `MarketMakingRuntimeTimingService`, expose runtime timing snapshots at `GET /metrics/runtime`, and emit foundational order/balance/stream-health events from the cache + tracker layer without changing strategy behavior yet
- Switch dual-account volume hedging from maker-placement ACK coupling to maker fill-driven execution: persist `activeCycle`, start private order+trade watchers for both `accountLabel`s, emit taker IOC intents only from observed maker fill deltas, and finalize `completedCycles` only after tracked orders settle with fully hedged maker fill
- Preserve `accountLabel` naming in dual-account runtime/fill routing while carrying it end-to-end through tracker recovery and user-stream dispatch, so the strategy can distinguish maker/taker account boundaries without renaming runtime fields to `keyId`
- Remove the deprecated dual-account maker-delay / inline-hedge chain end-to-end: delete the dead execution helpers and settlement timeout config, drop `makerDelay*` from server/frontend schemas and admin direct status surfaces, and keep dual-account execution purely maker fill-driven

## 2026-04-16

- Centralize strategy-definition capability derivation for admin direct MM: expose `directOrderCompatible`, `directExecutionMode`, and `launchSurfaces` on definition responses, and filter direct-launch surfaces by capability instead of controller-name allowlists
- Surface `dualAccountBestCapacityVolume` in admin strategy settings by adding a seeded definition, frontend schema template, controller picker entry, and display labels so it appears in `/manage/settings/strategies` instead of remaining backend-only
- Rewrite `docs/planning/2026-04-13-hyperliquid-pancakeswap-volume-strategy.md` from a loose validation checklist into an execution-ready implementation + validation plan: add explicit phases, hard gates, file ownership, test matrix, operator runbook outputs, Hyperliquid `key_id` account-identity alignment, and a measured decision point for whether per-exchange queue serialization is acceptable
- Lock `dualAccountVolume.tradedQuoteVolume` to the single-leg progress definition: preserve the execution-layer taker-fill quote counter during dual-account fill/PnL persistence, add regression coverage so user-stream fills cannot overwrite it with gross fill notional, and document that `targetQuoteVolume` stops against taker-leg quote progress rather than doubled turnover

## 2026-04-14

- Archive superseded planning docs (`2026-04-13-dual-account-volume-runtime-follow-up-checklist.md`, `2026-04-13-composable-strategy-architecture.md`, `2026-04-14-user-stream-dual-account-todo.md`) and refresh `docs/planning/README.md`, `todo.md`, and the active user-stream plan so the planning index matches current work
- Add `BalanceStateCacheService` plus `watchBalance()` ingestion and tracker application so dual-account/runtime balance reads can use WS-primary cached balances with REST backfill on stale reads
- Add `BalanceStateRefreshService` to refresh silent accounts via REST and expose coarse stream-health states (`healthy`, `degraded`, `silent`, `reconnecting`) plus last refresh timestamps
- Add `inventory_balance` as a dual-account side-selection mode so the runtime can bias buy/sell from live maker inventory instead of rigid cycle alternation
- Add `UserStreamCapabilityService` to classify exchanges into `full` / `partial` / `rest_only` capability tiers and expose those diagnostics, along with cache freshness and stream health, through the admin direct status endpoint
- Finish the dual-account fee-buffer correction: `loadTradingRules()` now exposes `takerFee`, the runtime sizes dual-account capacity against `makerFee + takerFee`, and the buffer formula now retains `1 - totalFeeRate` instead of dividing by `1 + fee`
- Reuse a single dual-account balance snapshot across preferred-side evaluation, fallback-side evaluation, and rebalance candidate selection so one tick no longer re-fetches the same maker/taker balances multiple times
- Start Phase 1/2 of the user-stream migration in runtime code: add `UserStreamIngestionService` / `UserStreamTrackerService` aliases, normalize `watchOrders()` into `kind:'order'` events, add `watchMyTrades()` ingestion for `kind:'trade'` events, and suppress duplicate normalized trade fills in the tracker while preserving existing watcher/tracker unit coverage
- Close Phase 0 of the 2026-04-14 user-stream / dual-account todo by adding the normalized `UserStreamEvent` contract, datasource/normalizer interfaces, and the private-stream architecture baseline later merged into `docs/architecture/market-making-flow.md`
- Tighten dual-account taker IOC completion rules in `StrategyIntentExecutionService`: require a confirmed taker fill before counting a completed cycle, accumulate `tradedQuoteVolume` from actual taker fill quote, and fail IOC acks that return neither an exchange order id nor any fill
- Add a new active planning doc, `docs/planning/2026-04-14-hummingbot-like-user-stream-plan.md`, to scope a phased migration from the current `watchOrders()`-only private stream path toward a Hummingbot-like normalized user-stream architecture with first-class balance/order/trade events and explicit REST fallback loops

## 2026-04-13

- Capture a dated TODO checklist for the remaining dual-account runtime issues seen in the latest MEXC run: chronic overlap pressure, per-exchange queue serialization across accounts, repeated below-minimum preferred-side collapse before fallback, and missing explicit taker IOC fill-completeness validation
- Add two dual-account volume guardrails for admin direct runs: reserve a small fee buffer when turning live balances into publishable capacity, and clamp quantized maker prices back to the correct top-of-book side (or skip the cycle if no valid post-only price remains) so MEXC edge-size cycles stop flapping between `Insufficient position` and `maker_not_best`
- Make `quantizeAndValidateQuote()` short-circuit raw below-min dual-account rebalance quotes and swallow exchange precision rejections as skip signals, so tiny-balance MEXC sessions stop surfacing fatal `amountToPrecision()` errors on tick
- Set the seeded `dualAccountVolume` default `cadenceVariance` to `0.25` so new admin direct runs inherit a 25% cycle-interval jitter instead of a perfectly fixed cadence
- Guard dual-account volume quotes with pre-quantization exchange min/max checks and let below-min preferred sides fall through to fallback/rebalance instead of surfacing CCXT `InvalidOrder` errors
- Add a `750ms` dual-account maker settlement window after the IOC leg: if the maker still looks live after the confirmation check, the runtime now cancels it instead of leaving a stale post-only order blocking later cycles
- Make dual-account volume sizing adapt to live maker/taker balances each tick: the runtime now shrinks oversized cycles down to the currently affordable amount and skips only when the quantized order would fall below exchange minimums
- Make dual-account volume retry the opposite side when the preferred side is not tradable with current balances, while short-circuiting zero-sized post-balance quotes before CCXT precision calls
- Add dual-account local auto-rebalance: when neither normal side is tradable, the strategy now submits a single-account IOC rebalance order that restores the next feasible side without advancing published-cycle counters
- Rework dual-account market-making runtime logs for operations: every cycle now carries `tickId/cycleId`, dual-account decision logs explain preferred vs selected side with duration, taker execution logs emit per-stage timing summaries, and tick-overlap warnings are throttled into aggregated backpressure summaries

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
- Rewrite `docs/archive/plans/2026-04-10-api-key-identity-migration-plan.md` into an MVP hard-cutover plan: no old-client compatibility, no old-order/runtime preservation, `key_id` as the sole runtime identity, and a full DB reset + seed deployment assumption
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
- Add strategySnapshot to MarketMakingOrder with strategyDefinitionId, definition key/name, controllerType, resolvedConfig, and resolvedAt
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

- Add dynamic strategy definition architecture (`strategy_definitions`) and instance linkage fields on `strategy_instances`
- Add admin strategy definition lifecycle APIs (create/list/get/update/enable/disable)
- Add admin strategy instance APIs (validate/start/stop/list)
- Add legacy strategy instance backfill endpoint
- Add seeded built-in strategy definitions (pure market making, arbitrage, volume)
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
- Block pause/withdraw execution while any same-user asset reservation remains locked across order scopes
- Add estimated-fee reconciliation that reverses temporary fee debits after matching actual fee evidence arrives
- Re-enable market-making `withdraw_to_exchange` to execute real exchange-address withdrawals behind idempotent order-ledger debits and queued confirmation monitoring
- Add exchange deposit confirmation gate that polls base/quote exchange balances after Mixin withdrawal confirmation before queueing campaign handling
- Treat missing HuFi campaign matches as a skipped campaign gate that moves the order to `created` before market-making start
- Join matching HuFi campaigns through the configured signer/read-only exchange credentials and fail the order when the required join call fails
- Persist market-making lifecycle failure reasons on orders via `lifecycleError`, including required HuFi campaign join failures
- Extend the payment-flow system test to drive payment -> withdrawal -> Mixin confirmation -> exchange deposit confirmation -> campaign gate -> start, ending in `running`
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

## 2026-04-14

- Finish dual-account user-stream plan: add exchange normalizer registry, trade-over-order fill dedup, balance cache + REST refresh diagnostics, and admin status visibility for watcher state, queue depth, and duplicate suppression

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
