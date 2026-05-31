# Order Performance PnL Plan

## Goal

Add a generic order-level performance endpoint that derives realized PnL,
fees, net PnL, traded volume, effective spread, and a cumulative time series
from immutable ledger entries. The implementation must work for both ordinary
user market-making orders and admin-created orders. Direct admin orders are not
a separate performance model; they are market-making orders whose ownership is
resolved by the calling endpoint.

## Approved API Shape

- `GET /web3/market-making/orders/:orderId/performance`
  - Authenticated user endpoint.
  - The web3 market-making controller/service verifies the order belongs to the
    authenticated user before calling the shared performance calculation.
- `GET /admin/market-making/orders/:orderId/performance`
  - Admin endpoint.
  - The admin controller keeps the admin authorization boundary and calls the
    same shared performance calculation.

Do not add a direct-order-specific performance service or endpoint for the core
model.

## Backend Design

- Reuse `server/src/modules/market-making/performance/PerformanceService`.
- Add `getOrderPerformance(orderId)` to compute order-level metrics.
- Add `BalanceLedgerService.findByOrderId(orderId)` as a read-only ledger
  query ordered by `createdAt ASC, entryId ASC`.
- Keep `BalanceLedgerService` as a ledger access/projection service only; it
  must not replay PnL.
- Keep ownership and permission checks in the calling user/admin services.
- Use `bignumber.js` for all arithmetic.
- Do not add new storage for v1.

## Calculation Rules

- Use ledger entries for the target `orderId`.
- Group fill-related entries by the current fill event key in the ledger data.
- A fill group must include base and quote `fill_settle` entries.
- Price is `abs(quoteDelta / baseDelta)`.
- Side is derived from the sign of `baseDelta`.
- Replay average-cost realized PnL using the same semantics as the existing
  strategy/order PnL logic.
- Sum fees cumulatively:
  - Quote-asset `fee_debit` is counted directly in quote.
  - Base-asset `fee_debit` is converted to quote at the fill price.
  - Third-asset fees are returned separately and excluded from quote net PnL.
- Net quote PnL is `realizedPnlQuote - feesQuote`.
- Downsample the returned time series for UI rendering.

## Response Shape

```ts
{
  series: Array<{
    t: string;
    realized: string;
    fees: string;
    net: string;
  }>;
  summary: {
    realizedPnlQuote: string;
    feesQuote: string;
    netPnlQuote: string;
    tradedQuoteVolume: string;
    effectiveSpreadBps: string | null;
    fillCount: number;
    otherFees: Array<{ assetId: string; amount: string }>;
  };
  reconciliation?: {
    realizedPnlMatchesStored: boolean;
    storedRealizedPnlQuote?: string;
  };
}
```

## Admin Interface V1

- Add an admin helper call in
  `admin-interface/src/lib/helpers/mrm/admin/direct-market-making.ts`.
- Add shared order performance types instead of naming them direct-order-only.
- Add `PnlChart.svelte` under
  `admin-interface/src/lib/components/market-making/direct/`.
- Render the chart and summary row in `OrderDetailsDialog.svelte`.
- Use inline SVG and daisyUI semantic colors only.
- Add `en.json` and `zh.json` i18n keys.

## User Interface V1

- Add the backend endpoint now.
- Defer user-interface chart wiring to a later UI pass.

## Test Plan

- Backend unit tests for:
  - Buy then sell realized PnL.
  - Partial close.
  - Quote fee.
  - Base fee converted by fill price.
  - Third-asset fee excluded from quote net PnL.
  - Same timestamp deterministic ordering.
  - Empty ledger returns an empty series and zero summary.
- Controller/service tests for:
  - User endpoint rejects another user's order.
  - Admin endpoint returns performance for an allowed order.
- Frontend tests for:
  - Helper URL/response mapping.
  - PnL chart empty, positive, negative, and mixed states.
  - Order details dialog loads and renders summary fields.

## Progress

- [x] Plan approved.
- [x] Plan written to `docs/plans/`.
- [x] Inspect existing ledger event-key and stored PnL fields.
- [x] Add ledger `findByOrderId`.
- [x] Implement shared order performance calculation.
- [x] Add user and admin endpoints.
- [x] Add admin-interface helper/types/chart/dialog integration.
- [x] Add focused backend tests.
- [x] Add focused frontend helper test.
- [x] Run focused verification.
- [x] Update `docs/plans/progress.md`.
