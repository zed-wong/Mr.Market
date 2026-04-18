# Codebase Health Audit — 2026-04-18

**Composite Score: 4.7/10** — NEEDS WORK

## P0 — Type Safety (blocks 13 test suites, runtime crash risk)

4 methods called on `this` in `StrategyService` but never defined. This will throw `TypeError` at runtime.

- [ ] Implement `finalizeSettledDualAccountCycle` (`strategy.service.ts:1451`)
- [ ] Implement `buildActiveDualAccountCycleState` (`strategy.service.ts:1588`)
- [ ] Implement `resolveTrackedOrderForFill` (`strategy.service.ts:4855`)
- [ ] Implement `applyDualAccountFillProgress` (`strategy.service.ts:4880`)

## P1 — Lint (server: 181 errors, 27 warnings; interface: 4 errors)

- [ ] Run `bun run lint --fix` on server — ~140/181 are auto-fixable formatting
- [ ] Remove 4 unused destructured vars in `CreateOrderModal.svelte` (lines 71-77): `cadenceVarianceError`, `tradeAmountVarianceError`, `priceOffsetVarianceError`, `makerDelayVarianceError`
- [ ] Remove unused `UserStreamEvent` import in `generic-ccxt-user-stream-event-normalizer.service.ts:5`
- [ ] Fix 4 `@typescript-eslint/no-explicit-any` warnings on server

## P2 — Dead Code (server)

- [ ] Remove or wire up `time-indicator.service.ts` (528 lines)
- [ ] Remove `snapshots-metrics.service.ts` (220 lines)
- [ ] Remove `mixin.processor.ts` (77 lines)
- [ ] Remove `spot.event.ts` + `market-making.event.ts`
- [ ] Remove `spotChecks.ts` (28 lines)
- [ ] Remove `pricing.ts` in defi/utils (60 lines)
- [ ] Remove `signal.ts` + `signaltype.ts`
- [ ] Remove `health.fixture.ts`
- [ ] Remove `soak-error-injector.ts` + `soak-snapshot-collector.ts`
- [ ] Evaluate `typeorm.config.ts` at root — keep if TypeORM CLI needs it, else remove
- [ ] Remove 8 unused runtime deps: `@nestjs/axios`, `@nestjs/event-emitter`, `@nestjs/serve-static`, `@nestjs/terminus`, `@types/sqlite3`, `cookie-parser`, `express`, `protobufjs`
- [ ] Remove 9 unused devDeps: `@golevelup/ts-jest`, `@types/bull`, `@types/cookie-parser`, `@types/express`, `@types/express-session`, `@types/supertest`, `source-map-support`, `supertest`, `ts-loader`
- [ ] Clean 19 unused exports and 34 unused exported types

## P2 — Dead Code (interface)

- [ ] Remove 5 unused Svelte components: `title.svelte`, `growNewArbBar.svelte`, `growNewMMBar.svelte`, `marketMakingBar.svelte`, `action.svelte`
- [ ] Remove `temporary.ts` (28 lines)
- [ ] Remove `fetch.ts` + `socket.ts` unused store abstractions (87 lines total)
- [ ] Remove 3 unused type files: `asset.ts`, `arbitrage.ts`, `market_making.ts`
- [ ] Fix duplicate export: `encrypt|encryptSecret` in `crypto.ts`
- [ ] Remove 4 unused runtime deps: `jsencrypt`, `tweetnacl`, `tweetnacl-sealedbox`, `tweetnacl-util`
- [ ] Remove 5 unused devDeps: `eslint-config-standard-with-typescript`, `eslint-plugin-import`, `eslint-plugin-n`, `eslint-plugin-promise`, `tslib`
- [ ] Audit and trim ~91 unused exports (stores: `grow.ts`, `market.ts`, `spot.ts`; helpers: `mixin.ts`, `chart.ts`, `sortTable.ts`)

## P3 — Polish

- [ ] Resolve 19 unresolved imports in interface (`./$types` in SvelteKit routes — likely generated, but knip flags them)
- [ ] Add `knip.json` config to both projects for false-positive suppression and CI tracking

## Already Completed

- [x] Remove `mixin/rebalance/` module and `common/types/rebalance/` directory (bigone.ts, map.ts)
- [x] Move `AggregatedBalances` type to `exchange.ts`
- [x] Clean commented-out `RebalanceModule` import from `mixin.module.ts`

## Dashboard Summary

| Category | Tool | Score | Status | Details |
|----------|------|-------|--------|---------|
| Type check (server) | tsc --noEmit | 4/10 | CRITICAL | 4 errors: missing method defs |
| Type check (interface) | svelte-check | 10/10 | CLEAN | 0 errors |
| Lint (server) | eslint | 3/10 | CRITICAL | 181 errors, 27 warnings |
| Lint (interface) | eslint | 7/10 | WARNING | 4 errors (unused vars) |
| Tests (server) | jest | 7/10 | WARNING | 375 pass, 13 suites fail (TS import) |
| Tests (interface) | vitest | 10/10 | CLEAN | 161 pass, 19 skipped |
| Dead code (server) | knip | 5/10 | NEEDS WORK | 54 files, 17 deps, 19 exports, 34 types |
| Dead code (interface) | knip | 5/10 | NEEDS WORK | 7 files, 9 deps, 91 exports, 11 types |