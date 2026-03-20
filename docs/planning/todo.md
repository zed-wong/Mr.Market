# Mr.Market

## Current Todo

This file keeps the detailed unchecked checklist and also adds short summary sections so the current work is easier to scan.

Completed work should stay in `progress-log.md`, not here.

## Backend

### System Test Improvements

#### Summary

- Close infrastructure and operational fidelity gaps identified in the 2026-03-20 gap analysis.
- Three phases: P0 (database + tick coordinator + durability), P1 (reconciliation + queue + reconnect), P2 (multi-pair + cadence + config).
- See `docs/planning/2026-03-20-system-test-gap-analysis-and-improvement-plan.md` for full rationale.

#### P0 — High impact, low cost (~5 h)

- [] 1. Switch `MarketMakingSingleTickHelper` to file-based SQLite with WAL mode (add `createSystemTestDatabaseConfig` to `sandbox-system.helper.ts`, temp dir cleanup in afterAll)
- [] 2. Add `ClockTickCoordinator` integration system spec — register real tick components, call `tickOnce()`, assert intents generated through full production path and per-component error isolation
- [] 3. Add `DurabilityService` system spec — append outbox event, mark processed once (true), mark processed again with same key (false/idempotent)

#### P1 — Medium impact, medium cost (~5 h)

- [] 4. Add `ReconciliationService` system spec — one valid + one violation case per reconciliation type (ledger invariant, reward consistency, stale SENT intent)
- [] 5. Add queue dispatch shape test — spy on `FakeQueue.add` during `startOrder`/`stopOrder`, assert job name, data shape, and jobId convention
- [] 6. Add back-off logic unit test for `PrivateStreamIngestionService.getBackoffDelayMs` — verify 0 ms on first failure, exponential growth, and 30 s cap
- [] 7. Add WebSocket reconnection smoke test — mock `watchOrders` to throw on first call, succeed on second, assert `queueAccountEvent` called after recovery

#### P2 — Lower priority (~4 h)

- [] 8. Add multi-pair executor isolation test — create two orders with different pairs, assert separate executor instances, ticking one pair produces zero intents for the other
- [] 9. Add explicit far-future cadence guard assertion — set `nextRunAtMs` to `Date.now() + 999_999_999`, call `onTick`, confirm zero new intents
- [] 10. Add config validation — implement `validateConfig` against `StrategyDefinition.configSchema`, add unit tests for negative bidSpread, missing required fields, etc.

### Security

#### Summary

- Add authentication and ownership checks for private `user-orders` list, detail, payment, and history endpoints.
- Keep `GET /user-orders/market-making/strategies` public for frontend strategy selection.

#### Detailed Checklist

User orders security
- [] 1. add authentication and ownership checks for user order list/detail/payment/history endpoints under `user-orders`
- [] 2. keep `GET /user-orders/market-making/strategies` public for frontend strategy selection

### Market-making Funding Lifecycle

#### Summary

- Re-enable real `withdraw_to_exchange` execution instead of refund-only validation mode.
- Track exchange deposit confirmation end to end and update runtime state in real time.
- Automatically continue from confirmed deposit into campaign join and `start_mm`.
- Implement actual HuFi join execution in market-making `join_campaign` flow and in `CampaignService.joinCampaigns`.
- Add backend tests for join-campaign success, fallback, and cron auto-join error handling.
- Ensure user-triggered stop or withdrawal initiation is handled in a timely and safe way.

#### Detailed Checklist

Validation of create market making process
- [] 3. backend can withdraw to exchange (should link exchange api key only from db)
- [] 4. after withdrawal to exchange, the deposit status can be tracked by backend, update in real time
- [] 5. after arrival of deposit to exchange, then join campaign should be triggered automatically
- [] 6. after join campaign, or no campain to join, the market making handler can start mm right away
- [] 7. implement actual HuFi join campaign execution in market making `join_campaign` flow (not only local participation)
- [] 8. implement actual HuFi join campaign execution in `CampaignService.joinCampaigns` cron flow
- [] 9. add backend tests for market making `join_campaign` flow: successful HuFi join, no campaign match, and failure fallback behavior
- [] 10. add backend tests for cron auto-join flow: already joined skip, new campaign join, and API error handling
- [] 11. user call stop endpoint or initialize withdrawal, can be handled correctly by backend on time

### Execution and Reporting

#### Summary

- Reflect execution status, place/cancel logs, and runtime errors in user-visible market-making order details.
- Add comprehensive order tracking for volume, profit, placed count, fill amount, and success/failure/cancel counts.
- Calculate campaign reward trading outcomes from performance data.

#### Detailed Checklist

Market making execution system
- [] 1. market making execution system, including order status updates, place/cancel order logs, error handling. reflect on user's market making orders details.
- [] 2. comprehensive order tracking, including volume created, profit made, placed order count, filled order amount, success/failure/cancel count.
- [] 3. campaign reward trading, calculate reward based on performance.

### Deferred Strategy Follow-ups

#### Summary

- Remove `exchangeName` and `pair` from `StrategyInstance.parameters`; derive them from the bound `MarketMakingOrder` at runtime.
- Fix volume strategy follow-ups before expanding reuse further.
- Move `userId` / `clientId` / `marketMakingOrderId` injection to after schema validation so strict schemas can pass.
- Tighten admin strategy start and definition validation behavior.
- Clean up admin strategy endpoints, cache invalidation, and CCXT seeding reliability.

#### Detailed Checklist

Deferred strategy follow-ups
- [] 1. Remove `exchangeName`/`pair` from `StrategyInstance.parameters` - get from `MarketMakingOrder` binding at runtime instead of duplicating in params (conceptual cleanup, medium effort ~10-15 files)
- [] 2. Fix volume strategy controller follow-ups before expanding reuse: sanitize cadence input, keep rerun backward-compatible with legacy parameter keys, and stop deriving tenant identity from `strategyInstance.parameters.userId/clientId`
- [] 3. Move `userId`/`clientId`/`marketMakingOrderId` injection in strategy config resolution to after schema validation so strict schemas with `additionalProperties: false` can pass correctly
- [] 4. Make legacy admin strategy start fail on ambiguous enabled definitions instead of silently picking the oldest matching `controllerType`
- [] 5. Validate `controllerType` on strategy definition creation and reject unsupported controller values early
- [] 6. Roll back started runtime sessions when admin strategy start succeeds in dispatcher but fails to link the definition in storage
- [] 6. Align admin strategy definition/instance endpoints with more idiomatic REST semantics and boolean query parsing, then add controller tests for the new routes
- [] 7. Add TTL or explicit invalidation for cached market-making strategies in `interface/src/lib/helpers/mrm/marketMakingPayment.ts`
- [] 8. Reset CCXT seeder cache per run and add a timeout guard around `loadMarkets()` to avoid hanging the seed process
- [] 9. Parallelize chain icon fetching during pair seed generation and wrap `runSeed()` database cleanup in `try/finally`

## Interface

### Admin UX

#### Summary

- Add a setup guide for initialization so admin setup is easier to follow.
- Support sorting and filtering in manage market-making pairs and spot trading pairs.
- Update the admin login page UI to match the rest of the interface.
- Merge exchange and API key management into one clearer workflow.

#### Detailed Checklist

Admin page
- [] 0. Design a manage strategy page that allows admin to add/remove/create template strategies and custom strategies
- [] 1. Add a setup guide for initialization that is step by step, allowing admin to have basic understanding of how setting works, and makes it easier to set up all the things
- [] 2. Support sorting and filter in manage market making pairs/spot trading pairs
- [] 3. Update Admin login page UI design to be consistent with other pages
- [] 4. Merge manage exchange and api keys into one page, has consistent logic and don't make user confuse

Admin exchanges management
- [] 1. should design a way to merge /exchanges and /api-keys. so user don't get confused when adding exchange. api keys should be managed in the same place as exchanges, should be in the dropdown of the added exchange management page

# Hufi

## UI

### Campaigns

#### Summary

- Expand campaign pages beyond the current list/detail baseline.
- Show campaign-created trading volume.
- Let users create, join, and review campaigns with Mixin wallets.
- Let users create, join, and review campaigns with EVM wallets, including Mixin EVM.
- Add a HuFi learn-more page, campaign filters, and campaign-type-specific detail actions.

#### Detailed Checklist

- [-] 0. Mr.Market users can see all campaigns, and specific campaign details under /market-making/hufi
- [] 1. Mr.Market users should see volume created by Hufi campaigns
- [] 2. Mr.Market users can create campaigns with mixin wallet under /market-making/hufi
- [] 3. Mr.Market users can join hufi campaigns by creating market making orders with mixin wallet under /market-making/hufi
- [] 4. Mr.Market users can see joined hufi campaigns (via market making orders) under /market-making/hufi
- [] 5. Mr.Market users can see their created campaigns with mixin wallet under /market-making/hufi

- [] 6. Mr.Market users can create campaigns with evm wallets (including mixin evm wallet) under /market-making/hufi
- [] 7. Mr.Market users can join hufi campaigns by creating market making orders with evm wallets under /market-making/hufi
- [] 8. Mr.Market users can see joined hufi campaigns with evm wallets under /market-making/hufi
- [] 9. Mr.Market users can see their created campaigns with evm wallets under /market-making/hufi

- [] 10. HuFi Learn more page should introduce each types of campaigns
- [] 11. HuFi campaigns page should have a filter button put on top of the page, allowing user open dialog to filter campaigns (by campaign type, create/end date, DESC or ASC, reward amount)
- [] 12. For different types of campaigns, should have different types of actions in details page
