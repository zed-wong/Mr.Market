# Mr.Market Server Architecture

This document describes the current backend architecture of the `server` package in Mr.Market, based on the code in `server/src`. It is intended as a design reference for future feature work.

## 1) Architecture at a Glance

- Framework: NestJS (module-oriented architecture)
- Language/runtime: TypeScript on Node.js
- Primary storage: SQLite via TypeORM
- Queueing/background work: Bull + Redis
- Market/exchange integration: CCXT/CCXT Pro
- Mixin integration: `@mixin.dev/mixin-node-sdk`
- Web3 integration: `ethers`
- API surface: REST + Swagger + Socket.IO gateway

Core entrypoints:
- Process bootstrap: `server/src/main.ts`
- Root dependency graph: `server/src/app.module.ts`
- Runtime config mapping: `server/src/config/configuration.ts`
- Migration DataSource: `server/typeorm.config.ts`

## 2) Boot and Runtime Lifecycle

### 2.1 Bootstrap sequence

`server/src/main.ts` performs startup in this order:

1. Loads dotenv (`import 'dotenv/config'`).
2. Ensures `JWT_SECRET` exists; generates and appends to `.env` if missing.
3. Ensures `ENCRYPTION_PRIVATE_KEY` exists; generates and appends to `.env` if missing.
4. Creates Nest app from `AppModule`.
5. Enables CORS globally.
6. Adds global request logging middleware (method + URL) using `CustomLogger`.
7. Builds Swagger doc and exposes API docs at `/docs`.
8. Starts listening on `PORT` (default `3000`).

Design implication: startup mutates `.env` in-place if secrets are absent. This is convenient for local/dev bootstrap, but is stateful behavior at runtime.

### 2.2 Root module composition

`server/src/app.module.ts` wires all major concerns:

- Cross-cutting infra: logger, config, throttling, scheduling
- Database: TypeORM sqlite connection with migrations enabled
- Domain modules: strategy, trading, user orders, data modules, mixin modules, admin, campaign, web3, metrics
- Queue backend: Bull root config via Redis host/port from config

Key global runtime defaults from root module:
- Throttling: `ttl=60000`, `limit=60`
- TypeORM: `synchronize=false`, `migrationsRun=true`, sqlite WAL mode

## 3) Configuration and Secrets Model

### 3.1 Configuration map

`server/src/config/configuration.ts` exposes structured config namespaces:

- `database.path`
- `redis.host`, `redis.port`
- `apiKeys` (binance/mexc/bitfinex)
- `admin.pass`, `admin.jwt_secret`, `admin.encryption_private_key`
- `mixin.*` credentials
- `coingecko.api_key`
- `strategy.run`, `strategy.mixin_snapshots_run`
- `web3.network.*.rpc_url`, `web3.private_key`, `web3.gas_multiplier`
- `hufi.campaign_launcher.api_url`, `hufi.recording_oracle.api_url`

### 3.2 Security-related behavior

- Admin auth signs JWT via `admin.jwt_secret` (`server/src/modules/auth/auth.module.ts`).
- Exchange API secrets are encrypted/decrypted with keypair helpers (`server/src/modules/mixin/exchange/exchange.service.ts`).
- Public encryption key for clients is derived from private key (`getEncryptionPublicKey`).
- Mixin client initialization is gated on required bot credentials (`server/src/modules/mixin/client/mixin-client.service.ts`).

### 3.3 Notable config mismatch to keep in mind

`WithdrawalModule` checks `strategy.mixin_withdrawal_confirmation_run` (`server/src/modules/mixin/withdrawal/withdrawal.module.ts`), but this key is not declared in `configuration.ts`. If you rely on that switch, add it to central config to avoid implicit env-only behavior.

## 4) Module and Domain Boundaries

The backend is organized by business capabilities and infrastructure. Major module groups are below.

### 4.1 Infrastructure modules

- Logger: `server/src/modules/infrastructure/logger/*`
  - `CustomLogger` extends Nest logger and writes to winston file transports.
  - Optional webhook fan-out to Discord/Mixin group.
- Exchange initialization: `server/src/modules/infrastructure/exchange-init/*`
  - Builds and caches exchange clients.
  - Seeds exchange API keys from env when DB is empty.
  - Periodically refreshes instances when DB keys change.
  - Keep-alive logic for special exchange behavior.
- Health: `server/src/modules/infrastructure/health/*`
  - REST health endpoints.
  - Snapshot queue diagnostics (backlog, failures, stale polling).
- Runtime DB config abstraction: `server/src/modules/infrastructure/custom-config/*`

### 4.2 Trading and market-making modules

- Strategy engine: `server/src/modules/market-making/strategy/*`
  - Owns strategy lifecycle (start/stop/rerun).
  - Tracks in-memory running intervals + active orders.
  - Persists strategy status in `StrategyInstance` entity.
- Trade execution: `server/src/modules/market-making/trade/*`
  - Place/cancel orders via exchange abstractions.
- User order orchestration: `server/src/modules/market-making/user-orders/*`
  - User-facing order state and payment state model.
  - Market-making queue processor for payment verification/refund/withdraw flow.
- Fee calculation: `server/src/modules/market-making/fee/*`
- Metrics aggregation: `server/src/modules/market-making/metrics/*`
- Local campaigns: `server/src/modules/market-making/local-campaign/*`
- Performance tracking: `server/src/modules/market-making/performance/*`
- Network mapping helper: `server/src/modules/market-making/network-mapping/*`

### 4.3 Mixin modules

- Root aggregate: `server/src/modules/mixin/mixin.module.ts`
- Client: `server/src/modules/mixin/client/*`
- Snapshots ingestion and polling: `server/src/modules/mixin/snapshots/*`
- Exchange + API key persistence layer: `server/src/modules/mixin/exchange/*`
- Transaction send/refund: `server/src/modules/mixin/transaction/*`
- Withdrawal processing and confirmation workers: `server/src/modules/mixin/withdrawal/*`
- User and message helpers: `server/src/modules/mixin/user/*`, `server/src/modules/mixin/message/*`

### 4.4 Data modules

- Market data REST + websocket feed: `server/src/modules/data/market-data/*`
- Grow metadata config entities/repository: `server/src/modules/data/grow-data/*`
- Spot pair metadata: `server/src/modules/data/spot-data/*`
- Coingecko proxy integration: `server/src/modules/data/coingecko/*`

### 4.5 Access and administration modules

- Auth: `server/src/modules/auth/*`
  - Admin password login + JWT auth guard
  - Mixin OAuth callback flow
- Admin: `server/src/modules/admin/*`
  - Protected management API for strategy lifecycle and metadata CRUD
  - Exchange key admin APIs under `admin/exchanges`

### 4.6 Web3 and campaign integration modules

- Web3 signer/provider abstraction: `server/src/modules/web3/*`
- HuFi campaign orchestration and hourly join cron: `server/src/modules/campaign/*`

## 5) API Surface (High-level)

Main REST controller groups (from decorators in `server/src/modules/**/*controller.ts`):

- `/` and `/docs` (app metadata + docs redirect)
- `/auth/*` (login, oauth)
- `/admin/*` and `/admin/exchanges/*` (JWT-protected management APIs)
- `/health/*` (system and queue health)
- `/strategy/*`, `/trade/*`, `/fees/*`, `/performance/*`, `/metrics/*`, `/user-orders/*`
- `/market/*` (REST market data)
- `/coingecko/*`, `/grow/*`, `/spot/*`
- `/mixin/*`, `/exchange/*`, `/local-campaigns/*`

WebSocket gateway:

- Namespace: `/market`
- Implemented in `server/src/modules/data/market-data/market-data.gateway.ts`
- Subscription events: `subscribeOrderBook`, `subscribeOHLCV`, `subscribeTicker`, `subscribeTickers`, `unsubscribeData`

## 6) Asynchronous Processing and Scheduling

### 6.1 Bull queues and processors

Registered queues and processors:

- `snapshots` -> `SnapshotsProcessor`
- `market-making` -> `MarketMakingOrderProcessor`
- `withdrawals` -> `WithdrawalProcessor`
- `withdrawal-confirmations` -> `WithdrawalConfirmationWorker`
- `local-campaigns` -> `LocalCampaignProcessor`
- `mixin` -> `MixinProcessor` (processor exists; ensure queue is registered where used)

Queue setup locations:
- `server/src/modules/mixin/snapshots/snapshots.module.ts`
- `server/src/modules/market-making/user-orders/user-orders.module.ts`
- `server/src/modules/mixin/withdrawal/withdrawal.module.ts`
- `server/src/modules/market-making/local-campaign/local-campaign.module.ts`

### 6.2 Scheduled jobs and loops

Decorator-driven schedules:

- Snapshot polling every 5s (`SnapshotsProcessor`)
- Spot order update cron every 3s (`ExchangeService`)
- User-order cron tasks every 60s (`UserOrdersService`)
- Campaign join cron hourly (`CampaignService`)
- Snapshot metrics/minutely and daily jobs (`snapshots-metrics.service.ts`)

Manual intervals also exist:

- Strategy execution loops (`StrategyService`, `AlpacaStratService`)
- Exchange refresh and keep-alive (`ExchangeInitService`)
- Snapshot queue cleanup interval (`SnapshotsProcessor`)

Design implication: there is a hybrid scheduling model (`@Cron` + `setInterval`). Future work should maintain clear ownership and avoid duplicate timing logic for same responsibility.

## 7) Core Runtime Flows

### 7.1 Market-making onboarding flow (Mixin snapshot -> strategy)

1. Snapshot poller fetches new snapshots and enqueues `process_snapshot`.
2. `SnapshotsService.handleSnapshot` validates memo/version/trading type.
3. For market-making create memo:
   - Confirms `MarketMakingOrderIntent` exists and is active.
   - Marks intent state transitions (`pending` -> `in_progress`).
   - Enqueues `process_market_making_snapshots` on `market-making` queue.
4. `MarketMakingOrderProcessor`:
   - Validates grow pair is enabled.
   - Computes required fees.
   - Builds/updates `MarketMakingPaymentState`.
   - Retries `check_payment_complete` until complete/timeout.
   - Handles refund paths on invalid/timeout/error.
   - Proceeds to exchange funding/withdrawal/order logic when payment complete.

Primary files:
- `server/src/modules/mixin/snapshots/snapshots.service.ts`
- `server/src/modules/mixin/snapshots/snapshots.processor.ts`
- `server/src/modules/market-making/user-orders/market-making.processor.ts`

### 7.2 Strategy execution lifecycle

1. Strategy APIs call `StrategyService` start/stop methods.
2. Running state is persisted in `StrategyInstance` table.
3. In-memory map tracks interval handles and runtime state.
4. Intervals execute arbitrage/market-making/volume logic and place/cancel orders.
5. Orders/history are persisted for audit and metrics.

Primary files:
- `server/src/modules/market-making/strategy/strategy.service.ts`
- `server/src/common/entities/strategy-instances.entity.ts`
- `server/src/common/entities/market-making-order.entity.ts`
- `server/src/common/entities/arbitrage-order.entity.ts`

### 7.3 Withdrawal flow

1. Withdrawal record is initialized from snapshot or explicit flow.
2. Job queued to `withdrawals` queue with retries/backoff.
3. Processor atomically marks `pending/queued` -> `processing` to avoid double execution.
4. Balance check and Mixin transaction execution.
5. Status transitions to `sent`, `failed`, or retry path.

Primary files:
- `server/src/modules/mixin/withdrawal/withdrawal.service.ts`
- `server/src/modules/mixin/withdrawal/withdrawal.processor.ts`

### 7.4 Exchange API key and instance lifecycle

1. Exchange keys loaded from DB (`ExchangeService`).
2. Secrets decrypted with configured private key.
3. If DB is empty, env keys may be seeded (encrypted) into DB.
4. `ExchangeInitService` builds typed exchange instances per exchange/account label.
5. Refresh loop detects key signature changes and reinitializes clients.

Primary files:
- `server/src/modules/mixin/exchange/exchange.service.ts`
- `server/src/modules/infrastructure/exchange-init/exchange-init.service.ts`

## 8) Persistence Model

### 8.1 Database platform

- SQLite file path from `DATABASE_PATH` (default `data/mr_market.db`)
- WAL mode enabled for concurrency
- Migrations run automatically on startup

Config files:
- App runtime DB config: `server/src/app.module.ts`
- Migration DataSource: `server/typeorm.config.ts`

### 8.2 Entity groups by domain

Key entities in `server/src/common/entities` include:

- Trading/history: `trade`, `spot-order`, `market-making-order`, `arbitrage-order`, `performance`
- Strategy and user orders: `strategy-instances`, `user-orders`, `market-making-order-intent`, `payment-state`
- Exchange credentials and misc config: `api-keys`, `custom-config`
- Mixin domain: `mixin-user`, `mixin-message`, `mixin-release`, `transaction`, `withdrawal`
- Metadata/config catalogs: `grow-data`, `spot-data`
- Campaigns: `campaign`, `campaign-participation`, `contribution`

### 8.3 Migrations and seeding

Migrations are under `server/src/database/migrations/*` and include the initial schema plus incremental additions for payment state, order intent, and grow metadata extensions.

Seed script: `server/src/database/seeder/seed.ts`

- Seeds spot trading pairs
- Seeds grow exchanges and market-making pairs
- Seeds simply-grow tokens
- Seeds custom config defaults

## 9) Cross-Cutting Concerns

### 9.1 Logging

- `CustomLogger` writes to file logs and can push warnings/errors to Discord/Mixin webhooks.
- Logs path differs by environment and is relative to module path.

Potential operational note: creating logger instances with `new CustomLogger(...)` in many services bypasses DI-level logger centralization patterns; keep this consistent when extending.

### 9.2 Error handling style

- Mixture of thrown exceptions and logged+returned fallback values.
- Queue workers usually throw to leverage Bull retry behavior.
- External integration handlers often catch and convert errors to user-safe messages.

### 9.3 Authentication and authorization

- Admin APIs guarded by `JwtAuthGuard` (Passport JWT strategy).
- Login compares SHA-256 hash of stored admin password against provided client hash.
- Mixin OAuth flow updates local user token state.

Potential consistency note: `JwtModule` uses `admin.jwt_secret` while `JwtStrategy` reads `'JWT_SECRET'` key path directly. Align these to a single config key to avoid drift.

### 9.4 Throttling and API hygiene

- Global throttling configured in `AppModule`.
- Swagger annotations present across most controllers.

## 10) Current Extension Points for New Features

Recommended extension seams for future functionality:

1. New trading workflows
   - Add queue-first orchestration in `market-making` or dedicated queue module.
   - Persist lifecycle state in dedicated entity similar to `MarketMakingPaymentState`.

2. New exchange integrations
   - Extend env/db exchange config mapping in `ExchangeInitService`.
   - Add compatibility handling where exchange API semantics differ.

3. New market data products
   - Implement in `MarketdataService`, expose via controller/gateway, and reuse `createCompositeKey` subscription model.

4. New admin controls
   - Add DTO + controller + service composition in `modules/admin` and protect with `JwtAuthGuard`.

5. New campaigns/incentives
   - Reuse `LocalCampaignService` + queue processor pattern and extend `CampaignParticipation` schema.

## 11) Design Constraints and Technical Risks to Respect

When designing future functionality, account for the following existing constraints:

- Hybrid scheduler model (`@Cron` plus `setInterval`) can cause overlapping ownership if not carefully partitioned.
- In-memory runtime maps in strategy services mean process restarts require DB-backed recovery logic (already partly implemented via rerun).
- SQLite limits concurrent write throughput versus client-server RDBMS; queue volume and batch writes should be tuned accordingly.
- Some SQL in metrics uses PostgreSQL-specific functions (`DATE_TRUNC`) while runtime DB is sqlite; verify query portability before relying on it.
- Secret generation at startup mutates `.env`; immutable infra environments may need alternate secret injection policy.
- Config key naming is not fully uniform across modules; standardize as features expand.

## 12) Practical Checklist for Feature Design in This Codebase

Before implementation:

1. Decide if feature is synchronous API path or queue-driven workflow.
2. Define durable state entity first (TypeORM + migration).
3. Map exact handoff points between controller -> service -> queue -> processor.
4. Define failure/compensation logic (refund, retry, timeout, dead-letter behavior).
5. Confirm config keys are added to `configuration.ts` and documented.
6. Add health/metrics visibility if introducing new long-running workers.
7. Add tests at module boundary (`*.service.spec.ts`, `*.controller.spec.ts`) and at workflow edges.

## 13) Quick File Map (Most Important for Onboarding)

- Bootstrap/runtime
  - `server/src/main.ts`
  - `server/src/app.module.ts`
  - `server/src/config/configuration.ts`

- Trading engine
  - `server/src/modules/market-making/strategy/strategy.service.ts`
  - `server/src/modules/market-making/user-orders/market-making.processor.ts`
  - `server/src/modules/market-making/user-orders/user-orders.service.ts`

- Exchange and integrations
  - `server/src/modules/infrastructure/exchange-init/exchange-init.service.ts`
  - `server/src/modules/mixin/exchange/exchange.service.ts`
  - `server/src/modules/mixin/client/mixin-client.service.ts`

- Snapshot and withdrawal pipelines
  - `server/src/modules/mixin/snapshots/snapshots.service.ts`
  - `server/src/modules/mixin/snapshots/snapshots.processor.ts`
  - `server/src/modules/mixin/withdrawal/withdrawal.service.ts`
  - `server/src/modules/mixin/withdrawal/withdrawal.processor.ts`

- Data, campaigns, and operations
  - `server/src/modules/data/market-data/market-data.service.ts`
  - `server/src/modules/data/market-data/market-data.gateway.ts`
  - `server/src/modules/campaign/campaign.service.ts`
  - `server/src/modules/infrastructure/health/health.service.ts`

---

If you use this document to plan new functionality, treat it as the current-state architecture baseline and verify assumptions against module code before introducing cross-cutting refactors.
