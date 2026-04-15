# Dual Account Volume Release Gate

Date: 2026-04-11

## Current Verdict

`dualAccountVolume` for admin direct market making is feature-complete enough for controlled internal validation, but it is not release-ready until the checks below are green on the post-cutover identity model.

## Mandatory Gate

- [x] Admin direct sandbox system spec passes on the current `key_id` identity model
- [x] Single-account admin direct sandbox system spec still passes after the identity cutover changes
- [ ] New admin direct dual-account order can start from UI using only `makerApiKeyId` and `takerApiKeyId`
- [x] Dual-account runtime publishes maker intents on the configured exchange pair
- [x] Maker acceptance triggers inline taker IOC on the second account
- [x] Taker failure triggers best-effort maker cancel on the maker account
- [ ] Restart cleanup cancels dangling maker orders and does not replay taker
- [x] Status endpoint reports `publishedCycles`, `completedCycles`, balances, and account metadata correctly
- [ ] Admin direct UI order details show dual-account progress and inventory data correctly
- [ ] Account identity cutover runbook is executed: stop workers, reset DB, migrate, seed, re-add API keys, hard refresh UI

## Nice-To-Have Before Wider Rollout

- [x] Add a dedicated dual-account sandbox system spec instead of relying only on unit coverage for maker->taker sequencing
- [ ] Run a longer bounded soak on post-cutover admin direct orders
- [ ] Capture an operator runbook for common failures: low balance, stale executor, blocked intent queue, taker rejection

## Known Blocker Resolved In This Change

- The admin direct sandbox system spec had drifted behind the API-key identity cutover and still used the removed `accountLabel` request field plus legacy `exchange_index` mock data.
