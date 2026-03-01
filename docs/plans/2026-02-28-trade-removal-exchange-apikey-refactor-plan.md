# 2026-02-28 Trade Removal + Exchange API Key Service Refactor Plan

## Goals
- Remove `TradeService` and `TradeModule` from runtime.
- Remove `Trade` entity and drop the corresponding DB table via migration.
- Rename/move `ExchangeService` to `ExchangeApiKeyService` under market-making scope.
- Keep `ExchangeInitService` as the only CCXT lifecycle owner.
- Keep `ExchangeConnectorAdapterService` as strategy execution adapter.

## Phase 1: Planning and Branch
- [x] Create branch: `refactor/remove-trade-and-rename-exchange-service`
- [x] Add migration/refactor plan document in `docs/plans/`.

## Phase 2: Trade Removal
- [x] Remove `server/src/modules/market-making/trade/*`.
- [x] Remove `TradeModule` imports from app/admin/strategy modules.
- [x] Remove `Trade` entity registration from TypeORM `entities` list.
- [x] Add DB migration to drop `trade` table safely.
- [x] Update strategy intent execution to remove `TradeService` fallback.
- [x] Update tests to remove `TradeService` references.

## Phase 3: Exchange Service Rename + Move
- [x] Create `server/src/modules/market-making/exchange-api-key/`.
- [x] Rename class `ExchangeService` -> `ExchangeApiKeyService`.
- [x] Move service ownership from mixin folder to market-making folder.
- [x] Rewire imports/usages across app modules and controllers.
- [x] Keep `ExchangeInitService` dependency on new `ExchangeApiKeyService` only.
- [x] Keep strategy runtime execution path through `ExchangeConnectorAdapterService`.

## Phase 4: Safety Verification
- [x] Run type checks/build for `server`.
- [x] Run focused tests for changed modules.
- [x] Run full relevant test suite if feasible.
- [x] Fix regressions and re-run checks.

## Phase 5: Final Validation
- [x] Confirm no `TradeService` or `TradeModule` references remain.
- [x] Confirm no `Trade` entity references remain.
- [x] Confirm all `ExchangeService` references are replaced with `ExchangeApiKeyService`.
- [x] Document any intentional leftovers/follow-ups.
