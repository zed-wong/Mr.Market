# Mr.Market

## Current Todo

This file keeps the detailed unchecked checklist and also adds short summary sections so the current work is easier to scan.

Completed work should stay in `progress-log.md`, not here.

## Backend

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
- [ ] 3. backend can withdraw to exchange (should link exchange api key only from db)
- [ ] 4. after withdrawal to exchange, the deposit status can be tracked by backend, update in real time
- [ ] 5. after arrival of deposit to exchange, then join campaign should be triggered automatically
- [ ] 6. after join campaign, or no campain to join, the market making handler can start mm right away
- [ ] 7. implement actual HuFi join campaign execution in market making `join_campaign` flow (not only local participation)
- [ ] 8. implement actual HuFi join campaign execution in `CampaignService.joinCampaigns` cron flow
- [ ] 9. add backend tests for market making `join_campaign` flow: successful HuFi join, no campaign match, and failure fallback behavior
- [ ] 10. add backend tests for cron auto-join flow: already joined skip, new campaign join, and API error handling
- [ ] 11. user call stop endpoint or initialize withdrawal, can be handled correctly by backend on time

### Execution and Reporting

#### Summary

- Reflect execution status, place/cancel logs, and runtime errors in user-visible market-making order details.
- Add comprehensive order tracking for volume, profit, placed count, fill amount, and success/failure/cancel counts.
- Calculate campaign reward trading outcomes from performance data.

#### Detailed Checklist

Market making execution system
- [ ] 1. market making execution system, including order status updates, place/cancel order logs, error handling. reflect on user's market making orders details.
- [ ] 2. comprehensive order tracking, including volume created, profit made, placed order count, filled order amount, success/failure/cancel count.
- [ ] 3. campaign reward trading, calculate reward based on performance.

### Deferred Strategy Follow-ups

#### Summary

- Remove `exchangeName` and `pair` from `StrategyInstance.parameters`; derive them from the bound `MarketMakingOrder` at runtime.
- Fix volume strategy follow-ups before expanding reuse further.
- Move `userId` / `clientId` / `marketMakingOrderId` injection to after schema validation so strict schemas can pass.
- Tighten admin strategy start and definition validation behavior.
- Clean up admin strategy endpoints, cache invalidation, and CCXT seeding reliability.

#### Detailed Checklist

Deferred strategy follow-ups
- [ ] 1. Remove `exchangeName`/`pair` from `StrategyInstance.parameters` - get from `MarketMakingOrder` binding at runtime instead of duplicating in params (conceptual cleanup, medium effort ~10-15 files)
- [ ] 2. Fix volume strategy controller follow-ups before expanding reuse: sanitize cadence input, keep rerun backward-compatible with legacy parameter keys, and stop deriving tenant identity from `strategyInstance.parameters.userId/clientId`
- [ ] 3. Move `userId`/`clientId`/`marketMakingOrderId` injection in strategy config resolution to after schema validation so strict schemas with `additionalProperties: false` can pass correctly
- [ ] 4. Make legacy admin strategy start fail on ambiguous enabled definitions instead of silently picking the oldest matching `controllerType`
- [ ] 5. Validate `controllerType` on strategy definition creation and reject unsupported controller values early
- [ ] 6. Roll back started runtime sessions when admin strategy start succeeds in dispatcher but fails to link the definition in storage
- [ ] 7. Align admin strategy definition/instance endpoints with more idiomatic REST semantics and boolean query parsing, then add controller tests for the new routes
- [ ] 8. Add TTL or explicit invalidation for cached market-making strategies in `interface/src/lib/helpers/mrm/marketMakingPayment.ts`
- [ ] 9. Reset CCXT seeder cache per run and add a timeout guard around `loadMarkets()` to avoid hanging the seed process
- [ ] 10. Parallelize chain icon fetching during pair seed generation and wrap `runSeed()` database cleanup in `try/finally`

### Intent Worker Rate-Limiting

#### Summary

- Replace flat per-exchange concurrency limit with intent-type-differentiated (query vs. mutation) limits per exchange.
- Add per-exchange configuration so Binance, OKX, and small CEXs get appropriate limits.
- Add retry with exponential backoff so failed intents are requeued instead of dropped.
- Make in-flight state survive restart via DB reconciliation.
- Add structured metrics for observability and runtime tuning.

#### Detailed Checklist

- [ ] Implement the plan in `docs/planning/2026-04-08-intent-worker-rate-limiting-improvements.md`

## Interface

### Admin UX

#### Summary

- Add a setup guide for initialization so admin setup is easier to follow.
- Support sorting and filtering in manage market-making pairs and spot trading pairs.
- Update the admin login page UI to match the rest of the interface.
- Merge exchange and API key management into one clearer workflow.

#### Detailed Checklist

Admin page
- [ ] 0. Design a manage strategy page that allows admin to add/remove/create template strategies and custom strategies
- [ ] 1. Add a setup guide for initialization that is step by step, allowing admin to have basic understanding of how setting works, and makes it easier to set up all the things
- [ ] 2. Support sorting and filter in manage market making pairs/spot trading pairs
- [ ] 3. Update Admin login page UI design to be consistent with other pages
- [ ] 4. Merge manage exchange and api keys into one page, has consistent logic and don't make user confuse

Admin exchanges management
- [ ] Unified Exchange Account design — merge `admin_exchanges` + `api_keys_config` into single `ExchangeAccount` entity. See `docs/planning/2026-04-02-unified-exchange-account-design.md` for full design.

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

- [ ] 1. Mr.Market users should see volume created by Hufi campaigns
- [ ] 2. Mr.Market users can create campaigns with mixin wallet under /market-making/hufi
- [ ] 3. Mr.Market users can join hufi campaigns by creating market making orders with mixin wallet under /market-making/hufi
- [ ] 4. Mr.Market users can see joined hufi campaigns (via market making orders) under /market-making/hufi
- [ ] 5. Mr.Market users can see their created campaigns with mixin wallet under /market-making/hufi

- [ ] 6. Mr.Market users can create campaigns with evm wallets (including mixin evm wallet) under /market-making/hufi
- [ ] 7. Mr.Market users can join hufi campaigns by creating market making orders with evm wallets under /market-making/hufi
- [ ] 8. Mr.Market users can see joined hufi campaigns with evm wallets under /market-making/hufi
- [ ] 9. Mr.Market users can see their created campaigns with evm wallets under /market-making/hufi

- [ ] 10. HuFi Learn more page should introduce each types of campaigns
- [ ] 11. HuFi campaigns page should have a filter button put on top of the page, allowing user open dialog to filter campaigns (by campaign type, create/end date, DESC or ASC, reward amount)
- [ ] 12. For different types of campaigns, should have different types of actions in details page

### Current UI follow-ups

- [ ] 13. Test join campaign process manually
- [ ] 14. Show user created order in `/market-making/+page.svelte`
- [ ] 15. Show created order details in detail page
