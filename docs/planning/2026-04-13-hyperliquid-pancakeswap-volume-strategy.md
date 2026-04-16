# Hyperliquid Dual-Account Volume + PancakeSwap Volume Strategy

Date: 2026-04-13

Status: Draft - active implementation + validation plan

## Goal

Deliver a production-usable validation package for two existing strategy paths:

1. Make the existing `dualAccountVolume` strategy work reliably on Hyperliquid.
2. Validate the existing `volume` + `amm_dex` strategy on PancakeSwap V3 in a real environment.

This doc is intentionally not a product roadmap. It is the execution plan for hardening, testing, and gating release of those two paths.

---

## Scope

### In Scope

- Confirm the current architecture can execute the two target flows with the existing strategy types.
- Add the minimum exchange-specific normalization required to make those flows reliable.
- Add focused automated coverage for any new normalization or guardrail logic.
- Produce operator runbooks and release gates for Hyperliquid and PancakeSwap.
- Document discovered exchange-specific quirks and recommended default parameters.

### Out of Scope

- No new strategy type.
- No UI redesign or new admin workflow.
- No multi-account counter-recon expansion; that remains in `2026-04-12-multi-account-counter-recon-volume-strategy.md`.
- No compatibility layer for legacy account identity shapes; current `key_id`-based runtime identity remains the only supported model.
- No speculative abstraction work unless the existing code proves insufficient.

---

## Current Baseline

### What already exists

- Dual-account runtime lifecycle, invariants, and file ownership are documented in `docs/architecture/strategies/dual-account-volume.md`.
- `ExchangeInitService` already supports multi-account loading from `api_keys_config`, with runtime account identity derived from `key_id`.
- `ExchangeConnectorAdapterService` already supports account-aware order placement, cancellation, balance reads, order-book reads, and precision quantization.
- `DexVolumeStrategyService` already supports `pancakeV3` execution on chain `56` using the configured factory/router/quoter addresses.

### What is already resolved

- CCXT `4.5.34` includes `ccxt.pro.hyperliquid`. The class is available via `resolveExchangeClass('hyperliquid')`. No dependency upgrade needed.
- Hyperliquid does not need to be added to the `getEnvExchangeConfigs()` static list. The existing `buildExchangeConfigsFromDb()` path dynamically resolves any exchange name present in `api_keys_config`, so Hyperliquid initialization goes through the DB-backed path with no code change.

### What is still unknown

- Whether Hyperliquid's authentication model (`secret` = Ethereum private key, plus a required `walletAddress` option) is compatible with the current `api_keys_config` schema and `buildExchangeConfigsFromDb()` account mapping, which only passes `api_key` and `api_secret` — there is no `walletAddress` field today.
- Whether Hyperliquid supports the exact `postOnly` + `IOC` semantics assumed by the dual-account flow.
- Whether two Hyperliquid API keys correspond to two independent wallet addresses (no self-trade-prevention risk) or to sub-accounts under one vault (STP may apply). The validation plan must confirm the account topology before any dual-account run.
- Whether current PancakeSwap V3 addresses, quoting path, allowance flow, and gas economics are still acceptable in a real environment.

### Important existing constraints

- The current exchange request queue is keyed by `exchangeName`, not by `exchangeName + accountLabel`. Two accounts on the same exchange still serialize through one queue. Because the dual-account flow is time-sensitive (a `postOnly` maker can be consumed by the open market before the taker fires), cross-account serialization with a 200ms minimum interval is a correctness concern, not just a performance concern. This must be measured and gated in Phase 1 before any live validation.
- Hyperliquid account setup in this codebase must follow `api_keys_config.key_id -> runtime accountLabel`. The older idea of arbitrary operator-defined `accountLabel` is not the current contract.

---

## Success Criteria

This plan is complete only when all of the following are true.

### Hyperliquid

- The repo can initialize two separate Hyperliquid accounts through the current exchange bootstrap path.
- A sandbox/testnet or otherwise low-risk validation run completes at least `10` cycles with correct maker/taker behavior and no structural runtime failure.
- A small real-funds validation run completes with acceptable cycle success rate and no unresolved exchange-specific blockers.
- Any required Hyperliquid-specific normalization is covered by targeted tests and documented.
- The remaining known risk level is explicitly stated as either:
  - acceptable for limited production use, or
  - blocked pending a named follow-up.

### PancakeSwap V3

- The repo can quote and execute PancakeSwap V3 swaps for a supported BSC pair with current addresses.
- A local-fork dry run passes with reproducible steps.
- A small real-funds mainnet validation run passes with tracked gas/slippage/cost output.
- Recommended live-run parameters are documented and justified from measured data.

---

## Delivery Phases

### Phase 0 - Code-path audit and hard gates

Purpose: prove the repo is structurally ready before spending time on live validation.

#### Deliverables

- Capability matrix for Hyperliquid and PancakeSwap against current code assumptions.
- Clear go/no-go decision for each target path.
- Short list of required code changes, if any.

#### Tasks

- [x] ~~Confirm current CCXT runtime exposes a Hyperliquid exchange class through `resolveExchangeClass()`.~~ **Resolved**: `ccxt 4.5.34` has `ccxt.pro.hyperliquid`.
- [ ] Confirm `api_keys_config` schema can carry Hyperliquid's required authentication fields. Hyperliquid CCXT requires `secret` = Ethereum private key and an exchange option `walletAddress` = the corresponding wallet address. The current `buildExchangeConfigsFromDb()` only maps `api_key` and `api_secret` with no mechanism to pass `walletAddress`. Determine whether:
  - a small bootstrap adjustment in `ExchangeInitService` can inject `walletAddress` from an existing or new column, or
  - the `api_key` field can be repurposed as `walletAddress` since Hyperliquid does not use traditional API keys.
- [ ] Confirm Hyperliquid market metadata from `loadMarkets()` includes the precision/limit fields used by `quantizeOrder()` and `loadTradingRules()`.
- [ ] Confirm Hyperliquid order placement can represent:
  - maker leg: `limit` + `postOnly`
  - taker leg: `limit` + `timeInForce='IOC'`
- [ ] Confirm Hyperliquid balance payload shape is compatible with current dual-account capacity logic.
- [ ] Confirm two Hyperliquid keys represent two independent wallet addresses (not sub-accounts under one vault) to rule out self-trade-prevention blocking.
- [ ] Confirm current PancakeSwap V3 BSC addresses in `server/src/common/constants/defi-addresses.ts` are still valid for:
  - factory
  - router
  - quoterV2
  - wrapped native token
- [ ] Confirm `PancakeV3Adapter.quoteExactInputSingle()` works for at least one target production pair.
- [ ] Confirm the current Web3 signer setup can provide a signer/provider on chain `56`.

#### Exit Gate

Proceed only if:

- Hyperliquid authentication model is compatible with the current DB schema (or the gap is a small, bounded column/bootstrap change).
- Hyperliquid is technically reachable in the current runtime, or the missing piece is small and well-bounded.
- PancakeSwap V3 quote path is confirmed valid, or the broken dependency is isolated and fixable.

If either path fails here because of fundamental unsupported infrastructure, stop and create a separate dated plan instead of forcing the rest of this document.

---

### Phase 1 - Hyperliquid integration hardening

Purpose: close the gap between "generic CCXT support" and "reliable dual-account runtime support".

#### Deliverables

- Any required Hyperliquid-specific connector normalization.
- Explicit account-setup runbook aligned to current `key_id` identity, including `walletAddress` provisioning.
- A go/no-go decision on whether the current per-exchange queue is acceptable for Hyperliquid dual-account runs.

#### Tasks

- [ ] Verify two separate Hyperliquid API keys can be stored in `api_keys_config` and loaded as distinct runtime accounts via `key_id`.
- [ ] If Phase 0 identified a `walletAddress` gap, implement the chosen bootstrap adjustment so Hyperliquid instances receive the correct exchange options at initialization time.
- [ ] Update this doc and operator notes to refer to `key_id`-derived runtime labels, not arbitrary `accountLabel` configuration.
- [ ] Measure Hyperliquid request behavior against the current `strategy.exchange_min_request_interval_ms` default of `200`.
- [ ] Measure whether the current exchange-level queue introduces unacceptable maker/taker latency for dual-account runs. This is a **hard gate**: if the serialized queue causes the maker `postOnly` order to be consumed by the open market before the taker IOC fires, the dual-account flow is structurally broken on Hyperliquid regardless of other correctness.
- [ ] If Hyperliquid rejects the current generic params, add a minimal normalization layer in `ExchangeConnectorAdapterService.placeLimitOrder()`.
- [ ] If Hyperliquid requires special market or account options at initialization time, add the smallest possible exchange-specific bootstrap adjustment in `ExchangeInitService`.
- [ ] If the current request queue causes unacceptable cross-account blocking, create a follow-up implementation task to move queue keys from `exchangeName` to `exchangeName + accountLabel`. Do not fold that refactor into this plan unless validation proves it is mandatory.
- [ ] Define a Hyperliquid validation pair list, ordered by risk:
  - testnet/sandbox pair
  - low-risk production pair

#### Acceptance Criteria

- Two Hyperliquid accounts can be initialized and addressed deterministically.
- The dual-account runtime can submit maker/taker legs in a form Hyperliquid accepts.
- Queue/latency measurement proves the maker order survives long enough for the taker to fire, with documented evidence. If it does not, this phase is blocked until the queue is partitioned per account.

---

### Phase 2 - Hyperliquid automated coverage

Purpose: avoid shipping exchange-specific behavior that only exists in operator memory.

#### Required Tests

- [ ] Unit coverage for any Hyperliquid-specific order param normalization.
- [ ] Unit coverage for any Hyperliquid-specific exchange bootstrap configuration.
- [ ] Unit or service-level coverage proving two `key_id`-backed accounts resolve into distinct exchange instances for the same exchange.
- [ ] Targeted regression coverage if queue behavior or interval logic changes as part of this work.

#### Nice to Have

- [ ] A sandbox-backed system spec that exercises the dual-account flow against a CCXT sandbox exchange with the same required semantics (`postOnly`, `IOC`, dual accounts), if Hyperliquid test infra is not stable enough for CI.

#### Exit Gate

No production Hyperliquid validation run should happen until any new exchange-specific code path has focused automated coverage.

---

### Phase 3 - Hyperliquid live validation

Purpose: prove the hardened path works under real exchange behavior.

#### Stage 3A - low-risk dry run

- [ ] Select a liquid Hyperliquid validation pair.
- [ ] Run `dualAccountVolume` with conservative parameters:
  - `numTrades: 10`
  - `baseIntervalTime: 5000`
  - small `baseTradeAmount`
  - fixed low-risk `postOnlySide` if needed for easier analysis
- [ ] Capture:
  - maker accepted / rejected count
  - taker IOC fill success count
  - completed cycle count
  - average cycle latency
  - balance deltas per account
  - all exchange-side error types

#### Stage 3B - limited production validation

- [ ] Run a small real-funds session on the approved low-risk pair.
- [ ] Increase run length to `20-50` trades only if Stage 3A is structurally clean.
- [ ] Record:
  - success rate
  - latency distribution
  - drift or stuck inventory
  - any self-trade-prevention or settlement anomalies

#### Hyperliquid Release Gate

Hyperliquid is considered ready for controlled production use only if:

- maker `postOnly` behavior is accepted reliably
- taker IOC behavior is accepted reliably
- cycle completion accounting is correct
- no unresolved structural blocker remains in queueing, self-trade-prevention, or account loading

If one of those fails, stop and open a dedicated follow-up plan with a narrow problem statement.

---

### Phase 4 - PancakeSwap V3 pre-flight and local fork validation

Purpose: prove the existing DEX path still works before real funds.

#### Deliverables

- Verified addresses and supported pair shortlist.
- Reproducible fork runbook.
- Measured local-fork baseline.

#### Tasks

- [ ] Verify BSC PancakeSwap V3 addresses in `server/src/common/constants/defi-addresses.ts`.
- [ ] Pick one primary validation pair and one fallback pair with meaningful liquidity.
- [ ] Verify the target pair has an active V3 pool for the chosen fee tier.
- [ ] Verify quote path through `PancakeV3Adapter.quoteExactInputSingle()`.
- [ ] Verify signer wallet has enough token balances and BNB for gas in the chosen environment.
- [ ] Confirm the target input token has sufficient ERC20 allowance for the PancakeSwap V3 router address. If not, execute an `approve` transaction before the first swap.
- [ ] Run a local BSC fork using the repo's preferred EVM tooling.
- [ ] Execute a dry run with:
  - `dexId: 'pancakeV3'`
  - `chainId: 56`
  - `numTrades: 5`
  - small `baseTradeAmount`
  - conservative `slippageBps`
- [ ] Capture:
  - tx hash or local receipt id
  - quoted amount out
  - minimum amount out
  - actual balance changes
  - observed slippage

#### Acceptance Criteria

- At least one target pair can be quoted and swapped end to end in a local-fork environment.
- The current amount/slippage math produces valid and non-zero execution bounds.

---

### Phase 5 - PancakeSwap V3 mainnet validation and operating envelope

Purpose: turn the existing code path into an operator-safe live strategy path.

#### Tasks

- [ ] Run a small mainnet validation session on the approved high-liquidity pair.
- [ ] Start with:
  - `numTrades: 10`
  - conservative `baseTradeAmount`
  - `slippageBps: 50` or lower if the measured pool supports it
- [ ] Record for every trade:
  - tx hash
  - gas used
  - gas cost in BNB and quote-equivalent terms
  - quoted amount out
  - actual received amount out
  - realized slippage
- [ ] Verify the strategy stops cleanly after the configured trade count.
- [ ] Summarize the typical cost of one run:
  - gas
  - slippage
  - price impact
- [ ] Document recommended minimum live parameters:
  - minimum base trade amount
  - recommended fee tier / pair choices
  - slippage bounds
  - minimum gas buffer

#### Release Gate

PancakeSwap V3 is considered ready for controlled production use only if:

- quotes and swaps succeed for the chosen pair
- gas and slippage remain within the documented envelope
- run completion and stop behavior are correct
- operators have a concrete parameter recommendation instead of ad hoc guesses

---

## Implementation Notes By File

| Area | File | Expected Change |
|------|------|-----------------|
| Exchange bootstrap | `server/src/modules/infrastructure/exchange-init/exchange-init.service.ts` | Likely: Hyperliquid requires `walletAddress` exchange option at init time; may need a small bootstrap adjustment to inject it from `api_keys_config` |
| Exchange execution | `server/src/modules/market-making/execution/exchange-connector-adapter.service.ts` | Only if Hyperliquid requires small order-param normalization |
| DEX constants | `server/src/common/constants/defi-addresses.ts` | Update PancakeSwap V3 addresses only if they are stale |
| DEX adapter tests | `server/src/modules/defi/adapters/pancakeV3.adapter.ts` and related specs | Add/adjust quote-path validation if needed |
| Strategy docs | `docs/architecture/strategies/dual-account-volume.md` | Update only if Hyperliquid-specific constraints change the documented runtime contract |
| Planning docs | this file, `docs/planning/README.md`, `docs/planning/progress-log.md` | Keep state and role aligned with reality |

The intended default is no broad refactor. Only change code where validation proves a concrete incompatibility.

---

## Risks And Decision Rules

### R1 - Hyperliquid class unavailable in current CCXT version

~~Decision: If unavailable, do not fake support in this plan.~~ **Resolved**: `ccxt 4.5.34` includes `ccxt.pro.hyperliquid`.

### R2 - Hyperliquid accepts orders but not the current maker/taker semantics

Decision:

- Add the smallest exchange-specific normalization possible.
- If normalization becomes strategy-shaping rather than parameter-shaping, stop and split a separate design plan.

### R3 - Hyperliquid dual-account runs are throttled by per-exchange serialization

Decision:

- Measure first.
- If acceptable for low-rate controlled runs, document and proceed.
- If unacceptable, open a follow-up implementation task to isolate rate limiting per account.

### R4 - PancakeSwap addresses or fee-tier assumptions are stale

Decision:

- Update constants and the runbook together.
- Do not hardcode pair-specific logic into strategy code unless the protocol itself changed.

### R5 - Live cost makes Pancake volume strategy economically pointless at small size

Decision:

- Document the minimum economically sensible trade size.
- Readiness here means "technically reliable", not "universally profitable".

### R6 - Hyperliquid authentication model incompatible with current DB schema

Decision:

- Hyperliquid CCXT requires `secret` = Ethereum private key and `walletAddress` as an exchange option. The current `api_keys_config` has `api_key` + `api_secret` but no `walletAddress` column.
- If `api_key` can be repurposed as `walletAddress` (since Hyperliquid has no traditional API key), do that with a small bootstrap adjustment in `ExchangeInitService` and document the convention.
- If a new DB column is needed, scope it as a minimal migration and do not generalize it beyond Hyperliquid in this plan.
- If the schema change is large or touches shared infrastructure, stop and open a separate enablement plan.

### R7 - Hyperliquid self-trade-prevention blocks dual-account runs

Decision:

- Two independent wallet addresses should not trigger STP. But sub-accounts under one vault may.
- Phase 0 must confirm the account topology. If the operator's two keys are under one vault, dual-account volume is structurally blocked on Hyperliquid and this plan should document that as a hard prerequisite rather than attempting a workaround.

---

## Test Matrix

| Target | Level | Required |
|--------|-------|----------|
| Hyperliquid connector normalization | unit | yes, if code changes |
| Hyperliquid exchange bootstrap adjustment (`walletAddress` injection) | unit | yes, if code changes |
| Hyperliquid dual-account account resolution | service/unit | yes |
| Hyperliquid live behavior | manual validation | yes |
| Pancake quote path | adapter/service | yes |
| Pancake ERC20 allowance / approval flow | manual or integration | yes |
| Pancake local fork swap path | manual or integration | yes |
| Pancake mainnet live behavior | manual validation | yes |

---

## Operator Runbook Outputs

This plan is not done until the following artifacts exist, even if they live as short sections in this doc or nearby docs.

- [ ] Hyperliquid setup checklist:
  - required credential shape (`walletAddress` + Ethereum private key)
  - how to store credentials in `api_keys_config` (which column maps to what)
  - two-account funding expectations (two independent wallets, not sub-accounts)
  - recommended validation pair
  - known exchange quirks
- [ ] Hyperliquid validation summary:
  - what passed
  - what failed
  - whether queue behavior is acceptable
- [ ] PancakeSwap setup checklist:
  - chain id
  - token pair
  - fee tier
  - gas buffer
  - wallet prerequisites
  - ERC20 token approval status for router
- [ ] PancakeSwap cost summary:
  - average gas
  - average slippage
  - recommended minimum trade size

---

## Final Exit Criteria

Close this plan only when:

- the required code changes are either merged or explicitly proven unnecessary
- automated coverage exists for any new exchange-specific logic
- Hyperliquid and PancakeSwap both have recorded validation outcomes
- operator-facing setup and parameter guidance is written down
- any unresolved blocker is moved into a separate dated follow-up plan instead of being left implicit
