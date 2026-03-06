# Strategy Architecture - User Orders, Strategy Definitions, and Execution Flow

## Executive Summary

This document describes the current architecture for:
1. **User orders** (Mixin transfers → bot)
2. **Strategy definitions** (YAML config in seeder)
3. **Strategy execution** (Controllers → Executors)
4. **Campaign rewards** (HUFI-based P&L calculation per user)

**Date:** 2026-03-06
**Scope:** Strategy definition and user order creation flow

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  User Action                                    │
│  POST /orders/create                             │
│  Body: { userId, amount, ... }                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌───────────────────────��─────────────────────────────────────┐
│  Bot Processes Order                                 │
│  - Checks definitionId                                │
│  - Starts strategy instance                             │
│  - Executes trades on exchange                            │
│  - Updates P&L (User profits, positions)                 │
│                                                 │
│                                                 ▼
│  Bot Withdraws User Funds                           │
│  - Returns profits to user                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Architectural Components

| Component | Location | Purpose |
|---------|--------|---------|
| **StrategyDefinition** | DB entity (`strategy_definitions` table) | Stores YAML configuration |
| **StrategyInstance** | DB entity (`strategy_instances` table) | Per-user runtime execution |
| **StrategyController** | TypeScript controller | Implements `decideActions()` |
| **PureMarketMakingExecutor** | Single executor | Handles all pure MM orders |
| **ExecutorOrchestrator** | Maps controller actions to intents |
| **ExecutorAction** | Intent model (CREATE_ORDER, CANCEL_ORDER, etc.) |
| **UserOrdersService** | Handles user order creation and Mixin transfers |
| **StrategyConfigResolver** | Merges defaults + user params |

---

## Part 1: Strategy Definition Architecture

### Definition Storage

**Database Table:** `strategy_definitions`

```typescript
interface StrategyDefinition {
  id: string;
  key: string;              // Unique identifier (e.g., 'pure-market-making')
  name: string;
  description?: string;
  controllerType: string;    // Maps to StrategyControllerRegistry
  configSchema: Record<string, unknown>;  // Full YAML config
  defaultConfig: Record<string, unknown>;  // Defaults (empty for user-created)
  enabled: boolean;
  visibility: 'system' | 'public';
  currentVersion: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Source:** `server/src/common/entities/market-making/strategy-definition.entity.ts`

### Seeder Loading

**Location:** `server/src/database/seeder/data/strategies/`

**File Format:** Hummingbot-compatible YAML

**Example (pure-market-making.yaml):**
```yaml
strategy: pure_market_making

exchanges:
  - exchange: binance
    candles:
      - id: market_data
        trading_pair: BTC-USDT
        interval: 1m

controller:
  candles: market_data
  bid_spread: 0.001
  ask_spread: 0.001
  order_amount: 0.001
  order_refresh_time: 15000
  max_position_ratio: 0.5
  # ... more parameters
```

**Loader:** `server/src/database/seeder/strategy-yaml.loader.ts`

### API Endpoint

**Export:** `GET /admin/strategy/definitions/:id/export`

**Headers:**
- `Content-Type: text/yaml`
- `Content-Disposition: attachment; filename="${id}.yaml"`

---

## Part 2: Strategy Instance Creation Flow

### Current Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  User creates order                                 │
│ Body: {                                              │
│   userId,                                              │
│   amount,                                               │
│   strategyKey: 'pure_market_making',                       │
│   pair: 'BTC-USDT',                                   │
│   // ... other params                                    │
└────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  AdminService.startStrategyInstance()              │
│  ↓
│  - Fetches definition by key                      │
│ - Validates userId + clientId                        │
│ - Calls StrategyConfigResolverService.mergeConfig()       │
│ - Calls StrategyRuntimeDispatcherService.startByStrategyType() │
│ - Links instance via StrategyService.linkDefinitionToStrategyInstance() │
│  ↓
│                                                 │
┌─────────────────────────────────────────────────────────────┐
│  StrategyController.decideActions()              │
│  ↓
┌─────────────────────────────────────────────────────────────┐
│ ExecutorOrchestrator.route()                │
│  ↓
│  - StrategyIntentStoreService.save()                 │
│  ↓
│                                                 │
┌─────────────────────────────────────────────────────────────┐
│ Executor actions → Exchange execution           │
└─────────────────────────────────────────────────────┘
```

### Data Flow

```
UserOrder (User Orders Service)
  →
StrategyDefinition (DB)
  →
StrategyConfigResolver (merge: defaultConfig + userParams)
  →
StrategyRuntimeDispatcher (startByStrategyType)
  →
StrategyController.decideActions()
  →
StrategyInstance (DB: tracks runtime)
  →
ExecutorOrchestrator.route()
  →
StrategyIntentStoreService.save()
  →
Exchange execution (CEX/DEX)
```

---

## Part 3: Execution Architecture

### Strategy Controllers

**Current:** Hard-coded TypeScript classes
- `PureMarketMakingStrategyController`
- `ArbitrageStrategyController`
- `VolumeStrategyController`
- `TimeIndicatorStrategyController`

**Interface:** `StrategyController`

```typescript
interface StrategyController {
  readonly strategyType: StrategyType;
  getCadenceMs(parameters: Record<string, any>, service: StrategyService): Promise<number>;
  rerun(strategyInstance: StrategyInstance, service: StrategyService): Promise<void>;
  decideActions(session: StrategyRuntimeSession, ts: string, service: StrategyService): Promise<ExecutorAction[]>;
  onActionsPublished?(session: StrategyRuntimeSession, actions: ExecutorAction[], service: StrategyService): Promise<void>;
}
}
```

### Registry

**Location:** `server/src/modules/market-making/strategy/controllers/strategy-controller.registry.ts`

**Mapping:**
```typescript
const CONTROLLERS: Map<StrategyType, StrategyController> = new Map([
  ['arbitrage', ArbitrageStrategyController],
  ['pureMarketMaking', PureMarketMakingStrategyController],
  ['volume', VolumeStrategyController],
  ['timeIndicator', TimeIndicatorStrategyController],
]);
```

### Execution Categories

| Category | Controllers | Execution Path |
|-----------|-------------|----------------|
| `clob_cex` | PureMarketMakingExecutor → ExchangeConnectorAdapterService |
| `clob_dex` | VolumeStrategyController → DexVolumeStrategyService |
| `amm_dex` | VolumeStrategyController → DexVolumeStrategyService |

---

## Part 4: User Orders & Business Model

### Critical Context

**User Role:** Sends Mixin transfers to bot wallet (USDT)
- **Purpose:** Fund bot for trading operations
- **Key Constraint:** Bot uses admin's exchange API keys (ONE account)

**Business Flow:**
```
1. User transfers funds (Mixin) → Bot wallet
2. User creates order via API → `/orders/create`
   - Order contains: `{ strategyKey, userId, clientId, amount, ... }`
3. Bot processes order → StrategyController.decideActions()
4. Bot executes trades via Executor → Exchange
5. Bot updates P&L (User profits, positions) → Campaign rewards
6. Bot withdraws profits to user → User receives funds
```

**Multi-Tenancy:**
- **Multiple users** can run SAME strategy (pure_market_making) simultaneously
- **Different pairs** - User A runs BTC-USDT, User B runs BTC-USDT
- **Different parameters** - Each user can have their own spreads, amounts
- **Different P&L** - Each user has their own HUFI campaign reward tracking

**P&L Attribution:**
- **StrategyInstance.userId**: Which user owns which strategy's P&L and positions
- **StrategyInstance.clientId**: Identifies user's specific campaign/client
- **StrategyInstance.marketMakingOrderId**: Links to Mixin order for correlation

### Key Entities

| Entity | Purpose |
|-------|--------|---------|
| `SimplyGrowOrder` | User's Mixin order (fund transfer) |
| `MarketMakingOrder` | Strategy execution order |
| `StrategyInstance` | Per-user strategy instance (linked to definition) |
| `PaymentState` | Tracks payment flow state (completed) |
| `StrategyDefinition` | YAML config template (default config) |
| `HufiCampaign` | Tracks P&L per user |

---

## Part 5: Strategy Definition vs Execution Logic

### What We Currently Have

| Aspect | Current | Target |
|--------|----------|
| **Definition format** | YAML files with exchange config (HUMMINGBOT) |
| **Executor type** | Single instance per strategy type (PureMM, Arbitrage, etc.) |
| **Decision logic** | Hardcoded in TypeScript controllers |
| **Runtime config** | Provided via user order parameters |
| **Default handling** | Empty defaultConfig for user-created strategies |

### What This Means

**Admin CAN:**
- ✅ Create strategies by defining YAML files
- ✅ Configure: exchange, spreads, amounts
- ✅ Override parameters when creating orders
- ❌ **CANNOT** add new strategy logic (write Python scripts)

### What This DOESN'T Provide

| **Custom trading logic** (write JavaScript/Python)
| Hummingbot's Python strategy controller approach
- Ability to define custom trading algorithms
- Requires embedded scripting engine
- **Security risk**: Code execution in bot environment

| **Full Hummingbot compatibility**:
  - Strategy parameters in YAML ✓
  - But NO trading logic execution
  - Hummingbot = config system, NOT execution system

---

## Design Issues

### Issue 1: Runtime Data in Strategy Definitions

**Problem:** Strategy definitions include runtime-specific data in config

**Examples:**
```yaml
# WRONG (current pure-market-making.yaml)
controller:
  userId: USER_ID_HERE  # ← Runtime data, not strategy!
  clientId: CLIENT_ID_HERE
  pair: BTC-USDT
  exchangeName: binance  # ← Exchange baked in!
```

**Why This Is Wrong:**
- **Mixing strategy with runtime config**
- Strategy definitions should be PURE LOGIC (trading algorithms)
- Runtime parameters (exchange, pair, userId) belong in USER ORDER FLOW
- Violates separation of concerns

**Correct:**
```yaml
# CORRECT (strategy definition only)
controller:
  bid_spread: 0.001
  ask_spread: 0.001
  order_amount: 0.001
  # ... strategy parameters ONLY
```

### Issue 2: Multi-Instance vs Single

**Current:** One `StrategyInstance` per user (per strategy type)

**Problem:** Multiple users creating separate strategy instances for same strategy
- Example: User A: pure_market_making on BTC-USDT
- User B: pure_market_making on BTC-USDT

**Why This Is Wrong:**
- **Inefficient**: Duplicate state management across instances
- **Potential conflicts**: User A's sell could fill User B's buy
- **Complex**: Need to track cross-user order conflicts

**Correct:**
**Option A: Single strategy instance per type** (recommended for your use case)
- Shared executor tracks per-user state and positions
- More complex but scales better

### Issue 3: Exchange Hardcoding in Definitions

**Problem:** Strategy definitions hardcode exchange names

**Examples:**
```yaml
exchangeName: binance  # ← Wrong!
```

**Correct:**
- Strategy definitions should be EXCHANGE-AGNOSTIC
- Exchange comes from USER ORDER (runtime parameter)

```yaml
# CORRECT (no exchange in strategy definition)
controller:
  bid_spread: 0.001
  ask_spread: 0.001
  # User specifies exchange in ORDER flow, not in definition!
```

---

## Conclusion

**Current Architecture Summary:**

| Component | Status | Notes |
|---------|--------|-------|
| Strategy Definitions | ✅ Hummingbot YAML config files, loaded by seeder |
| Strategy Controllers | ⚠ Hardcoded TypeScript, need refactor for custom logic |
| Executors | ✅ Single instances per strategy type, stable |
| Strategy Instances | ⚠ Per-user instances, userId hardcoded |
| User Orders | ✅ Mixin transfers → bot wallet, P&L tracking |
| Executors | ✅ Intent-based, exchange routing |

**Key Finding:** Current architecture is **halfway there**:
- ✅ Strategy definitions are correctly formatted (Hummingbot-style YAML)
- ✅ Execution flow is well-separated (decide → intent → executor)
- ❌ **Runtime data mixed into definitions** - userId, exchangeName baked in YAML
- ⚠ **Strategy controllers are hard-coded** - cannot add custom logic without TypeScript rewrite
- ❌ **Multi-instance model** - Creates duplication and complexity

**For Hummingbot Compatibility:**
- ✅ YAML config format (parameters) - DONE
- ❌ Trading logic (Python scripts) - NOT provided

---

## Recommendations

### Short Term: Keep Current, Document Future Refactor

**Short Term:**
1. ✅ Keep current implementation (Phase 1 complete)
2. 📝 Document current architecture in `docs/code/server/strategy-ARCHITECTURE.md`

**Medium Term:**
1. ⚠ Refactor strategy controllers to be rule-based (if custom logic needed)
2. ⚠ Separate runtime configuration from strategy definitions

**Long Term:**
1. 🎯 Support embedded scripting (JavaScript/TypeScript) for custom strategies
2. ⚠ Add YAML validation schema
3. ⚠ Complete migration to single-instance-per-strategy-type model
4. 🚜 Plugin system for hot-loading new strategies

---

## Architecture Validation

| Question | Answer | Notes |
|---------|--------|-------|
| **Are YAML configs pure strategy logic?** | No - they contain parameters, not execution logic |
| **Are controllers hard-coded?** | Yes - TypeScript classes with decideActions() method |
| **Can admins add custom strategies?** | No - only configure parameters |
| **Are executors shared?** | Yes - Single instances per strategy type |
| **Is userId/clientId runtime data?** | Yes - but baked in definitions (problem) |
| **User orders pooled account?** | Yes - Bot wallet uses admin's API keys |

---

## Related Files

| File | Purpose |
|------|--------|---------|
| `server/src/common/entities/market-making/strategy-definition.entity.ts` | DB entity for strategy definitions |
| `server/src/database/seeder/data/strategies/*.yaml` | Hummingbot-compatible configs |
| `server/src/modules/market-making/strategy/controllers/*` | Hardcoded strategy logic |
| `server/src/modules/market-making/strategy/strategy.service.ts` | Runtime strategy management |
| `server/src/modules/admin/strategy/adminStrategy.service.ts` | Admin CRUD for strategies |
| `server/src/modules/market-making/strategy/config/strategy-controller.types.ts` | Controller interface |
| `server/src/modules/market-making/strategy/execution/strategy-runtime-dispatcher.service.ts` | Maps strategy types to dispatchers |
| `server/src/modules/admin/strategy/admin.controller.ts` | API endpoints (including export) |

---

## End of Document

The architecture is well-structured with clear separation between configuration and execution. The YAML-based strategy definitions are correctly formatted as Hummingbot configs. However, the actual trading logic remains hardcoded in TypeScript controllers, limiting the system to pure parameter configuration rather than full strategy definition support.

For true Hummingbot compatibility (custom strategies, rule engines), significant architectural changes would be required.

