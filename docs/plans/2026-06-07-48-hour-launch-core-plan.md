# 48 Hour Launch Core Plan

Date: 2026-06-07

## Goal

Ship two narrow, usable launch paths in 48 hours:

1. **Adaptive Pure Market Making**: users can run real market-making that provides meaningful liquidity. The user takes inventory/market risk, and it is only "earning" when PnL is positive after fees.
2. **Dual Account Volume for HuFi rewards**: users can create a volume strategy from the frontend to produce qualified HuFi campaign volume, because HuFi's current market-making reward dimension is volume.
3. Both paths show volume, fees, PnL/net result, campaign status, and reward-relevant progress.
4. Admin can stop orders, inspect runtime health, and confirm ledger/reservation state.

This launch is not a broad product release. It is a controlled first production path for two different user jobs:

- Provide real liquidity with adaptive pure PMM.
- Participate in HuFi campaigns through dual-account volume reward farming.

## Product Scope

### In

- Two execution paths: adaptive pure market making and dual-account volume.
- One operator-supported exchange and pair for launch validation per path.
- Frontend order creation for normal users, especially volume strategy creation for HuFi campaign rewards.
- Admin direct market-making as the operational control and emergency surface.
- Web3 market-making pages if the user funding/order path passes the same smoke test; otherwise use the narrowest existing user-facing route that can safely create the strategy.
- HuFi campaign discovery, join status, and campaign progress visibility.
- Order-scoped balances, reservations, fills, fees, PnL/net result, and qualified volume.
- Stop/cancel/recovery paths that release reservations correctly.

### Out

- Multi-exchange public launch.
- New Web3 Router feature work beyond launch blockers.
- New dashboard polish, i18n expansion, or broad UI redesign.
- New strategy variation editing.
- DeFi, Hyperliquid, or extra funding routes.
- Any reward claim/distribution system that is not required to show HuFi campaign reward progress.

## Critical Path

### Adaptive Pure MM

```text
user selects pair/risk/funding
  -> adaptive pure PMM order created
  -> order-scoped funds available
  -> strategy tick emits intents only
  -> worker risk-checks and reserves
  -> exchange orders created
  -> fills settle into ledger with fees
  -> PnL/fees/inventory/risk are visible
  -> user understands positive PnL is the actual earning condition
  -> admin/web3 shows progress and risk state
  -> stop cancels live orders and releases remaining reservations
```

### Dual Account Volume for HuFi Rewards

```text
user selects HuFi campaign
  -> frontend creates dual-account volume order
  -> required account/API-key/funding readiness is validated
  -> strategy plans maker/taker account roles
  -> worker risk-checks and reserves per order/account leg
  -> maker and taker orders produce qualified volume
  -> fills/fees settle into order-scoped ledger
  -> campaign volume/reward progress is attributable to the user order
  -> expected reward, fee cost, and net result are visible
  -> stop cancels live orders and releases remaining reservations
```

## What Can Be Automated

### Codex can do directly

- Audit the current code path and produce a blocker list.
- Add or update focused tests for adaptive PMM, dual-account volume, reservation release, fill settlement, and campaign volume attribution.
- Run server unit/system tests and frontend check/build commands.
- Add small endpoint/UI fixes when the core path is broken.
- Add a launch smoke script or checklist that exercises the core APIs where credentials are not required.
- Update docs, runbook, and progress notes.
- Inspect logs and test output, then iterate on code.

### Codex can partially automate

- Real exchange validation: Codex can run the scripts and inspect output, but API keys, balances, and exchange access must already be configured by the operator.
- HuFi campaign join/progress validation: Codex can test API behavior and UI states, but external HuFi availability and real campaign enrollment need operator confirmation.
- Web3 Router validation: Codex can run local checks, but real wallet signing and chain state need operator-controlled credentials and funds.
- Dual-account live validation: Codex can verify planner/runtime/test behavior, but the operator must provide two usable accounts or account labels with enough funds.

### Human/operator must confirm

- Which exchange and pair are in launch scope.
- Which campaign is the launch campaign.
- Which two accounts/API keys are allowed for dual-account volume.
- API keys are valid and funded.
- Minimum live order size and max loss/risk budget.
- Production deployment target and rollback method.
- Whether Web3 user funding is launch-visible, or whether user strategy creation is launched through another narrower frontend path first.

## 48 Hour Schedule

### Hour 0-4: Freeze the Launch Slice

- Pick exactly one exchange, one pair, one HuFi campaign, one adaptive PMM definition, and one dual-account volume definition.
- Confirm how a normal user creates each order from the frontend.
- Confirm which two accounts/API keys support dual-account volume.
- Decide whether Web3 is visible or the first user-facing path is narrower.
- Record P0/P1 blockers from code/tests.

Exit gate:

- Launch slice is written down.
- No new feature scope is allowed unless it fixes a P0/P1 blocker.

### Hour 4-16: Prove the Core Path Locally

- Run migration/build/check gates.
- Run focused adaptive PMM tests.
- Run focused dual-account volume planner/runtime tests.
- Run reservation/fill settlement tests.
- Run campaign/progress tests.
- Create or update a smoke checklist for the lifecycle.

Exit gate:

- Local test evidence covers both paths through intent -> reservation -> exchange/tracked order -> fill -> ledger -> stop/release.
- Campaign volume is attributable to a user order.

### Hour 16-28: Fix Only Blockers

Allowed fixes:

- Incorrect ledger mutation.
- Missing order attribution.
- Reservation lock/release bugs.
- Strategy tick doing risk-increasing work directly.
- Fill/fee settlement mismatch.
- Campaign volume not attributable to order.
- Dual-account role/account readiness is unclear or unsafe.
- User frontend cannot create the volume strategy order.
- Admin cannot stop or inspect a running order.

Rejected fixes:

- Cosmetic UI work.
- Extra strategies.
- Extra exchanges.
- New campaign mechanics.
- New Web3 funding design.
- Treating adaptive PMM volume as a substitute for dual-account volume reward farming.

Exit gate:

- P0 blockers are gone.
- Remaining issues are documented with an operator workaround.

### Hour 28-36: Production-Like Smoke

- Deploy or run against a production-like environment.
- Use tiny balances and minimum viable order sizes.
- Start one adaptive PMM order, observe quote placement, then stop it.
- Start one dual-account volume order, observe planned maker/taker behavior or the closest safe dry-run/system proof, then stop it.
- If a real fill is unsafe/unavailable, use the closest existing mock/system path for settlement and record the limitation.

Exit gate:

- Admin can see status, balances, orders, errors, and stop controls.
- Reconciliation/risk gates block risk-increasing operations on mismatch.

### Hour 36-44: Launch Runbook and Final Gate

- Write the launch runbook.
- Write the emergency stop path.
- Record known risks and hidden/beta surfaces.
- Run final build/test smoke commands.

Exit gate:

- A second pass through the smoke checklist succeeds or has only accepted non-P0 gaps.

### Hour 44-48: Go/No-Go

Go only if:

- Adaptive pure PMM order can run and stop.
- Dual-account volume order can be created by a normal user-facing flow and can run/stop safely.
- Funds are order-scoped.
- Reservations are created and released correctly.
- Fill/fee settlement is attributable.
- Adaptive PMM shows PnL/fees/inventory enough to explain self-directed market-making performance.
- Dual-account volume shows campaign volume/reward progress, fee cost, and net result enough to explain reward farming.
- Admin can inspect and stop the system.

No-go if:

- Any path can double debit, lose attribution, or leave locked funds stuck.
- Stop/cancel is unreliable.
- Reconciliation mismatch still allows risk-increasing operations.
- Campaign volume cannot be tied to the order.
- Users cannot create the HuFi volume strategy from the frontend.
- Dual-account volume can trade without clear account-role readiness and order-level attribution.

## Automation Backlog

1. Add a launch smoke command that runs focused server specs for adaptive PMM, dual-account volume, reservations, fills, campaign progress, and admin direct MM.
2. Add a production-like API smoke script that checks health, admin auth, exchange readiness, campaign list, user order creation, order start, order stop, and reservation release.
3. Add a frontend smoke path for normal-user dual-account volume order creation.
4. Add an admin launch checklist page or doc section showing the exact fields to verify.
5. Add a single launch-status endpoint if current admin endpoints require too much manual correlation.
6. Add a campaign reward progress view backed by existing order performance and campaign contribution data, without creating a new reward distribution pipeline.
7. Add an adaptive PMM performance view that separates realized PnL, fee cost, inventory exposure, and spread capture.

## Current Recommendation

Launch as:

```text
User-facing adaptive pure market-making for real liquidity provision.
User-facing dual-account volume strategy for HuFi campaign volume rewards.
Admin remains the emergency and operational control surface.
Web3 funding remains hidden/beta only if it cannot pass the same lifecycle smoke.
```
