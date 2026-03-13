# Module Purpose and Business Usage

This file explains each backend module with three questions:

- What does it do?
- Why does it exist?
- Where is it used in business logic?

## admin domain

### `admin.module.ts`

- What: exposes admin management surface for strategies, grow data, spot data, fees, and exchange operations.
- Why: operators need a single control plane to configure and run the trading system.
- Where: used by internal/admin UI to create strategy definitions, publish versions, start/stop instances, and tune fee behavior.

### `exchanges/exchanges.module.ts`

- What: provides admin-focused exchange endpoints built on the exchange domain.
- Why: exchange visibility and control is required for operations.
- Where: used when admin pages query and manage exchange availability/config.

### `spot/admin-spot.service.ts`

- What: manages spot trading pair CRUD operations with cache invalidation.
- Why: spot pair management requires admin control surface separate from market-making.
- Where: used by admin spot management pages to add/remove/update trading pairs.

## auth domain

### `auth.module.ts`

- What: provides login and JWT strategy wiring.
- Why: admin endpoints require authenticated access.
- Where: used before any protected admin API call and for Mixin OAuth login flow.

## campaign domain

### `campaign.module.ts`

- What: syncs campaign metadata, estimates HUFI scores, and coordinates campaign-side actions.
- Why: market-making activity is tied to campaign participation and reward accounting.
- Where: used by scheduled jobs and market-making processor paths that join campaigns or update score snapshots.

## data domain

### `data/coingecko/coingecko.module.ts`

- What: cached proxy for token/market data from CoinGecko.
- Why: avoids direct frontend dependence on third-party API limits and normalizes access.
- Where: used by UI-facing market and token pages.

### `data/grow-data/grow-data.module.ts`

- What: manages grow and market-making pair metadata repository and APIs.
- Why: strategy and order flows require trusted pair/exchange metadata.
- Where: used in order-intent creation and admin pair management.

### `data/market-data/market-data.module.ts`

- What: serves market data through service/controller/gateway.
- Why: strategies and UI need live and queryable market states.
- Where: used by strategy market data provider and realtime client features.

### `data/spot-data/spot-data.module.ts`

- What: manages spot trading pair data and APIs.
- Why: spot features need a dedicated data boundary separate from market-making strategies.
- Where: used by spot pages and admin spot management.

## defi domain

### `defi/defi.module.ts`

- What: registers DEX adapters (UniswapV3Adapter, PancakeV3Adapter) and DexAdapterRegistry.
- Why: strategy runtime supports DEX execution categories and needs a provider abstraction.
- Where: used by market-making dex strategy services.

#### Defi module internal structure

- `defi/adapter-registry.ts` - DexAdapterRegistry for adapter lookup.
- `defi/adapters/` - DEX adapter implementations (uniswapV3.adapter.ts, pancakeV3.adapter.ts).
- `defi/abis.ts` - Contract ABI definitions.
- `defi/addresses.ts` - Contract addresses by chain.
- `defi/utils/` - DEX-related utility functions.

## infrastructure domain

### `infrastructure/custom-config/custom-config.module.ts`

- What: persistent storage/retrieval for custom runtime config values.
- Why: fee and operation knobs need runtime configurability.
- Where: used mainly by fee and operational control modules.

### `infrastructure/exchange-init/exchange-init.module.ts`

- What: exchange client/bootstrap initialization service.
- Why: all exchange operations need consistent startup, caching, and client lifecycle.
- Where: used across fee checks, health checks, and strategy execution dependencies.

### `infrastructure/health/health.module.ts`

- What: system health checks for core dependencies.
- Why: operations need visibility for exchange/mixin/runtime status.
- Where: used by monitoring and admin diagnostics.

### `infrastructure/logger/logger.module.ts`

- What: shared logger provider.
- Why: central logging format and behavior reduce debugging friction.
- Where: imported by runtime-heavy modules and processors.

## market-making domain

### `market-making/strategy/strategy.module.ts`

- What: core strategy runtime boundary, including controller registry, intent orchestration, intent store, and intent worker/executor.
- Why: strategy logic must be modular, durable, and execution-mode aware.
- Where: used by admin start/stop flows, queue-driven order flows, and tick-driven runtime processing.

#### Strategy module internal structure

- `strategy/config/` - Type definitions and DTOs (strategy-controller.types.ts, strategy.dto.ts, executor-action.types.ts).
- `strategy/controllers/` - Controller registry and implementations (ArbitrageStrategyController, PureMarketMakingStrategyController, VolumeStrategyController, TimeIndicatorStrategyController).
- `strategy/data/` - StrategyMarketDataProviderService for market data access.
- `strategy/intent/` - ExecutorOrchestratorService and QuoteExecutorManagerService for action intent handling.
- `strategy/execution/` - StrategyIntentExecutionService, StrategyIntentStoreService, StrategyIntentWorkerService, StrategyRuntimeDispatcherService, ExecutorRegistry, ExchangePairExecutor.
- `strategy/dex/` - AlpacaStratService, DexModule, StrategyConfigResolverService.

### `market-making/strategy/dex/dex.module.ts`

- What: DEX strategy support services and adapter wiring.
- Why: strategy definitions can execute in DEX categories.
- Where: used by runtime dispatcher/execution when strategy category is DEX-related.

### `market-making/user-orders/user-orders.module.ts`

- What: handles market-making user order APIs and queue processor.
- Why: this is the business bridge from payment intent to active strategy instance lifecycle.
- Where: used when creating MM intent, confirming payment, starting run, joining campaign, and handling exit paths.

### `market-making/tick/tick.module.ts`

- What: provides the clock tick coordinator contract.
- Why: strategy and trackers run as deterministic periodic components.
- Where: used by strategy service and tracker services registered as tick components.

### `market-making/trackers/trackers.module.ts`

- What: tracks order books, private stream events, and exchange order status.
- Why: execution and reconciliation require current exchange-side state.
- Where: used by strategy runtime and pause/withdraw drain logic.

### `market-making/execution/execution.module.ts`

- What: wraps exchange connector adapter service for normalized exchange side effects.
- Why: strategy execution needs one stable adapter layer over different exchanges.
- Where: used by strategy intent execution and orchestrator drain/cancel flows.

### `market-making/execution/fill-routing.service.ts`

- What: resolves fill events to orders using clientOrderId parsing and ExchangeOrderMapping fallback.
- Why: pooled executors need deterministic fill routing by exchange:pair.
- Where: used by private stream tracker when processing fill events.

### `market-making/execution/exchange-order-mapping.service.ts`

- What: manages ExchangeOrderMapping entity for fill routing fallback.
- Why: provides recovery path when clientOrderId parsing fails.
- Where: used by fill-routing.service and intent execution when placing orders.

### `market-making/ledger/ledger.module.ts`

- What: balance ledger with append-only entries and read-model balance updates.
- Why: internal balance mutations must be auditable and idempotent.
- Where: used for payment credits, lock/unlock, fee debit, withdraw debit, rewards, and rollback compensation.

### `market-making/durability/durability.module.ts`

- What: outbox event append and consumer receipt idempotency service.
- Why: external side effects and replay-safe consumers require durable event evidence.
- Where: used by strategy intent execution, ledger events, reward transfer, and orchestration compensation flows.

### `market-making/orchestration/orchestration.module.ts`

- What: pause+withdraw orchestration service wiring.
- Why: withdraw flow crosses strategy, trackers, execution, ledger, and withdrawal modules and needs one orchestration owner.
- Where: used for safe stop/drain/unlock/debit/withdraw/compensate business sequence.

### `market-making/reconciliation/reconciliation.module.ts`

- What: periodic consistency checks for ledger, intents, and order states.
- Why: long-running async systems need reconciliation against drift.
- Where: used in scheduled maintenance checks and anomaly detection.

### `market-making/rewards/rewards.module.ts`

- What: reward ledger/allocation pipeline and reward transfer/confirmation services.
- Why: campaign and platform rewards need deterministic accounting and transfer tracking.
- Where: used by scheduled reward workflows and post-trade allocation logic.

### `market-making/network-mapping/network-mapping.module.ts`

- What: resolves chain/network mappings for assets.
- Why: withdrawal and transfer paths require correct network routing metadata.
- Where: used by order withdrawal and asset/network dependent operations.

### `market-making/performance/performance.module.ts`

- What: stores and serves strategy performance snapshots.
- Why: operators and users need performance visibility.
- Where: used by admin and analytics endpoints.

### `market-making/metrics/metrics.module.ts`

- What: metrics API over strategy execution history.
- Why: runtime health and execution quality need quick query endpoints.
- Where: used by monitoring dashboards and operational analysis.

### `market-making/fee/fee.module.ts`

- What: fee calculation, checks, and related APIs.
- Why: every user order and settlement path depends on correct fee policy.
- Where: used before strategy activation, during order checks, and admin fee management.

### `market-making/exchange-api-key/exchange-api-key.module.ts`

- What: exchange credential management plus exchange-operation helpers.
- Why: exchange calls need secure key storage and consistent access semantics.
- Where: used by exchange endpoints, init service, and execution-adjacent paths.

### `market-making/local-campaign/local-campaign.module.ts`

- What: local campaign queue and participation processing.
- Why: some campaign logic is handled in internal queueable jobs.
- Where: used by market-making processor when user orders should join local campaign workflows.

## mixin domain

### `mixin/mixin.module.ts`

- What: aggregate module combining snapshots, exchange, message, user, and withdrawal boundaries.
- Why: Mixin integration is broad and reused by many business paths.
- Where: used by health, user-orders, and flow orchestration boundaries that need Mixin operations.

### `mixin/client/mixin-client.module.ts`

- What: shared Mixin API client service.
- Why: all Mixin features need one integration point for auth/session and request behavior.
- Where: used by snapshots, user, message, wallet, transaction, and withdrawal modules.

### `mixin/snapshots/snapshots.module.ts`

- What: snapshot polling/processing and queue bridge to market-making jobs.
- Why: incoming payments/snapshots are the trigger for order funding workflows.
- Where: used in periodic snapshot ingestion and market-making payment completion flow.

### `mixin/withdrawal/withdrawal.module.ts`

- What: executes withdrawals and runs confirmation workflows in queues/workers.
- Why: outbound transfers need retries, state tracking, and optional confirmation loops.
- Where: used by user order exit/refund paths and pause-withdraw orchestrator.

### `mixin/exchange/exchange.module.ts`

- What: exchange API surface over exchange operations.
- Why: clients and admin tools need exchange capabilities through backend APIs.
- Where: used by user-orders and admin exchange pages.

### `mixin/user/user.module.ts`

- What: Mixin user persistence and APIs.
- Why: account identity and profile linkage are needed across message/order/auth flows.
- Where: used by auth and message services.

### `mixin/message/message.module.ts`

- What: message ingest/store/send support.
- Why: bot/user communication uses this channel.
- Where: used in user interaction workflows tied to Mixin messaging.

### `mixin/transaction/transaction.module.ts`

- What: transaction query and helper service.
- Why: payment/withdraw lifecycle checks need transaction-level status reads.
- Where: used by snapshots and rewards/withdraw confirmation logic.

### `mixin/wallet/wallet.module.ts`

- What: wallet operation wrapper around Mixin client.
- Why: withdrawal services need wallet-specific API calls.
- Where: used by withdrawal module and transfer-related services.

### `mixin/rebalance/rebalance.module.ts`

- What: rebalancing endpoints/services.
- Why: system can require rebalance operations across exchanges.
- Where: used in operations-oriented rebalance flows.

### `mixin/listeners/events.module.ts`

- What: composition point for listener dependencies.
- Why: listener/event-driven behaviors need shared module wiring.
- Where: used by runtime where event/listener-driven integration is enabled.

## web3 domain

### `web3.module.ts`

- What: shared web3 provider/signing helper services.
- Why: campaign and reward flows require chain-level operations.
- Where: used by campaign module and reward transfer/confirmation services.
