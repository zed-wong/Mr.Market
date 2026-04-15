# Composable Strategy Architecture

**Status**: 🟡 Planning  
**Date**: 2026-04-13  

## Problem

The current strategy definition design has a fundamental tension:

- **Static DTOs** (`PureMarketMakingStrategyDto`, `ArbitrageStrategyDto`, etc.) have strong validation via `class-validator`, but are bypassed at runtime with unsafe `as unknown as DTO` casts.
- **Dynamic `configSchema`** (JSON Schema stored in `StrategyDefinition.configSchema`) uses a hand-rolled validator that only checks basic types — a weaker shadow of what the DTOs already enforce.
- Adding a new strategy requires writing a new DTO + Controller class + service methods + registration — the dynamic definition doesn't actually enable data-driven strategy creation.
- There are **no guardrails** — if a config says trade 1000 BTC, it tries.
- `StrategyService` is a 5000+ line monolith with per-strategy-type methods.

The design gives neither true flexibility (can't create strategies without code) nor true safety (no runtime guardrails on actions).

## Goal

Enable **unlimited user-created strategies** (composing audited building blocks) while enforcing **server-side safety guardrails** on every action before it reaches an exchange.

## Current Architecture

```
User → AdminStrategyService
     → StrategyDefinition (configSchema + defaultConfig)
     → ConfigResolverService (hand-rolled JSON Schema)
     → RuntimeDispatcher (if/else per strategy type)
     → 5 hardcoded Controllers (unsafe DTO casts)
     → StrategyService monolith (5000+ lines, per-type methods)
     → ExecutorOrchestrator (NO guardrails)
```

**Key files**:
- `server/src/common/entities/market-making/strategy-definition.entity.ts`
- `server/src/modules/market-making/strategy/dex/strategy-config-resolver.service.ts`
- `server/src/modules/market-making/strategy/execution/strategy-runtime-dispatcher.service.ts`
- `server/src/modules/market-making/strategy/controllers/*-strategy.controller.ts` (5 controllers)
- `server/src/modules/market-making/strategy/strategy.service.ts` (monolith)
- `server/src/modules/market-making/strategy/intent/executor-orchestrator.service.ts`

## Proposed Architecture

```
User → StrategyDefinition v2 (wires: signals + rules + actions + guardrails)
     → Signal Registry (midPrice, spread, indicator, oraclePrice, bookDepth, ...)
     → Rule Registry (if spread > X, if pnl < -Y, every N ticks, crossover, ...)
     → Action Registry (limitBuy, limitSell, cancelAll, replaceOrder, ammSwap, ...)
     → ComposableController (single generic controller, evaluates component graph)
     → Guardrail Layer (max order size, max position, max loss killswitch, rate limit, whitelist)
     → ExecutorOrchestrator (same as current)
```

### Data Model

```
StrategyDefinitionV2
  ├── id, key, name, description, enabled, visibility
  ├── guardrails (json) ─── max order size, max position, max drawdown, rate limit, allowed exchanges/pairs
  ├── SignalComponent[] ─── type (midPrice|spread|indicator|...), alias, config
  ├── DecisionRule[] ───── condition (gt|lt|between|every_n_ticks|...), signalAlias, threshold, priority
  └── ActionTemplate[] ── type (CREATE_LIMIT_ORDER|CANCEL_ORDER|...), side, params, triggeredByRule
```

### Key Differences

| Aspect | Current | Proposed |
|---|---|---|
| Adding a new strategy | Write DTO + Controller + service methods + register | Wire existing components — zero code |
| Controller classes | 5 separate, each with hardcoded logic | 1 generic `ComposableController` evaluates component graph |
| Type safety | Lost — `as unknown as DTO` casts | Not needed — components are pre-registered with typed evaluators |
| configSchema | Redundant partial copy of DTO validation | Gone — replaced by per-component schemas |
| StrategyService | 5000+ line monolith | Shrinks — signal evaluators and action builders are small isolated modules |
| Safety | None — no guardrails on actions | Guardrail layer validates every action before dispatch |
| User creativity | Pick from 5 types, tweak params | Unlimited combinations of signals × rules × actions |
| RuntimeDispatcher | Big if/else with manual field extraction | Gone — composable controller handles all types |

### What Stays the Same

- `ExecutorAction` / `StrategyOrderIntent` types — the output format is already good
- `ExecutorOrchestrator` — dispatching intents to exchanges
- `ClockTickCoordinator` → `runSession` loop — tick-based execution model
- `StrategyInstance` entity for tracking running instances

## Migration Path

1. **Add guardrail layer first** — immediate safety win, works with current controllers
2. **Build component registry + composable controller** alongside existing controllers
3. **Migrate existing strategies one by one** — e.g. `pureMarketMaking` becomes a definition with `midPrice` signal + `spreadThreshold` rule + `limitBuy/limitSell` actions
4. **Deprecate old per-type controllers** once all strategies are migrated

## Open Questions

- [ ] How expressive should decision rules be? Simple comparisons vs. a mini expression language?
- [ ] Should signals support derived/computed signals (e.g. spread = askPrice - bidPrice)?
- [ ] How to handle stateful strategies (e.g. volume strategy tracking `executedTrades`)?
- [ ] Should guardrails be per-definition, per-user, or both?
- [ ] How to version/snapshot definitions so running instances aren't affected by edits?
