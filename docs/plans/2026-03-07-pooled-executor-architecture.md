# Mr.Market Pooled Executor Architecture

**Version:** 2.0
**Date:** 2026-03-07
**Status:** Current Source of Truth
**Scope:** Active target architecture for pooled market-making runtime

> This is the authoritative architecture document for the pooled runtime as of 2026-03-07.
> If another plan in `docs/plans/` conflicts with this document, follow this document unless a newer doc explicitly states that it replaces this one.

---

## Executive Summary

Mr.Market is a multi-user market making bot that operates on centralized and decentralized exchanges. Users create market making orders by transferring funds to the bot via Mixin, and the bot executes trading strategies on their behalf while participating in HuFi campaigns to earn rewards.

### Key Architectural Principles

1. **Pooled Execution**: One executor per exchange-trading-pair shared across all users
2. **Hummingbot Compatibility**: Controller/orchestrator/executor separation with tick-driven execution
3. **Multi-User Isolation**: Per-order session state with shared execution context
4. **DB-Based Scripts**: TypeScript execution scripts stored in DB (source of truth)
5. **Campaign Integration**: Trade tracking, scoring, and reward distribution for HuFi campaigns
6. **Order-Level Transparency**: Users can see revenue breakdown per order
7. **Performance Optimization**: Non-blocking trade recording to minimize execution latency

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         User Layer (Mixin)                              │
│  Users create orders by transferring funds to bot via Mixin              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  User transfers funds → Mixin snapshot → Bot processes order            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Order Orchestration Layer                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  MarketMakingOrder (user order + strategyDefinitionId)           │   │
│  │  OrderExecutionBinding (binds order to executor)                │   │
│  │  BalanceLedger (single-writer for user funds)                   │   │
│  │  UserStrategyConfig (user's config overrides per strategy)       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Pooled Executor Layer                              │
│              (1 executor per exchange-trading-pair)                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  ExecutorRegistry                                                 │   │
│  │  - Map: "BINANCE:main:BTC-USDT" → ExchangePairExecutor         │   │
│  │  - getOrCreateExecutor(exchange, account, pair)                │   │
│  │  - removeExecutor(exchange, account, pair)                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  ExchangePairExecutor (BINANCE:main:BTC-USDT)                    │   │
│  │  ├─ Shared Resources (per executor)                              │   │
│  │  │  ├─ OrderBookTracker (exchange order book - market data)      │   │
│  │  │  ├─ PrivateStreamTracker (user fills/status from exchange)   │   │
│  │  │  ├─ MarketDataProvider (aggregates market data)              │   │
│  │  │  └─ ClientOrderTracker (shadow ledger for order state)       │   │
│  │  │                                                              │   │
│  │  ├─ Campaign Tracking (NEW)                                     │   │
│  │  │  └─ InMemoryTradeAggregator (Redis-based)                    │   │
│  │  │                                                              │   │
│  │  └─ Strategy Sessions (per-order isolation)                      │   │
│  │     ├─ StrategySession (User A's order state)                   │   │
│  │     ├─ StrategySession (User B's order state)                    │   │
│  │     └─ StrategySession (User C's order state)                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Strategy Definition Layer                             │
│         (TOML/JSON Config Schema + TypeScript Execution Script)          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Config Schema (TOML/JSON)                                        │   │
│  │  ├─ Metadata (name, version, description)                        │   │
│  │  ├─ Parameters (configurable fields + defaults)                 │   │
│  │  └─ Constraints (min/max, validation rules)                      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Execution Script (TypeScript)                                   │   │
│  │  ├─ Implements IStrategyScript interface                         │   │
│  │  ├─ validateConfig(config): boolean                              │   │
│  │  ├─ createSession(config): SessionState                          │   │
│  │  ├─ onTick(session, marketData): Action[]                       │   │
│  │  ├─ onFill(session, fill): Action[]                             │   │
│  │  └─ onError(session, error): Action[]                           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  File Structure:                                                         │
│  strategies/                                                             │
│    schemas/                     # Config schema files                     │
│      pure-market-making.toml                                            │
│      arbitrage.toml                                                      │
│    scripts/                       # Execution scripts                    │
│      pure-market-making.ts                                                │
│      arbitrage.ts                                                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Exchange Connector Layer                           │
│              (Hummingbot-style connector normalization)                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  ExchangeConnectorAdapter                                        │   │
│  │  - placeLimitOrder(exchange, pair, side, qty, price)             │   │
│  │  - cancelOrder(exchange, pair, orderId)                          │   │
│  │  - fetchOrder(exchange, pair, orderId)                           │   │
│  │  - fetchOrderBook(exchange, pair)                                │   │
│  │  - Rate limiting per exchange                                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Intent Orchestrator & Execution                                  │   │
│  │  - ExecutorOrchestrator: Actions → Intents                       │   │
│  │  - StrategyIntentStore: Persist intents to DB                    │   │
│  │  - StrategyIntentWorker: Async worker for execution              │   │
│  │  - StrategyIntentExecution: Execute exchange actions              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   Campaign Orchestration Layer                          │
│              (HuFi campaign integration and reward distribution)         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  CampaignService (EXISTING - HuFi Integration)                   │   │
│  │  - getCampaigns(): Fetch HuFi campaigns                         │   │
│  │  - joinCampaignWithAuth(): Join campaigns on behalf of bot        │   │
│  │  - Hourly cron to auto-join new campaigns                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  InMemoryTradeAggregator (Redis-based)                          │   │
│  │  - recordTrade(fill): Redis HINCRBY (no DB write)                │   │
│  │  - calculateOrderScore(orderId, date): BigNumber                 │   │
│  │  - calculateTotalDailyVolume(date): BigNumber                    │   │
│  │  - getParticipantScore(campaignId, userId): BigNumber            │   │
│  │  - flushOrder(orderId, date): Write to SQLite                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  CampaignRewardAccounting (NEW)                                  │   │
│  │  - processDailyRewards(campaignId, date): Calculate rewards      │   │
│  │  - Determine reward pool (target met or proportional)             │   │
│  │  - Calculate user shares based on scores                         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  CampaignRewardDistributor (NEW)                                 │   │
│  │  - distributeReward(userId, amount, campaignId, date)            │   │
│  │  - Credit user balances via BalanceLedger                        │   │
│  │  - Mixin internal transfers for distribution                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Strategy Definition Layer

Mr.Market uses a **two-part strategy definition** model:

1. **Config Schema** (TOML/JSON) - Defines what parameters exist, their types, defaults, and validation rules
2. **Execution Script** (TypeScript) - Defines the trading logic and how decisions are made

#### StrategyDefinition Entity

```typescript
interface StrategyDefinition {
  id: string;
  key: string;                       // e.g., "pure_market_making"
  name: string;
  description?: string;

  // DB-based script reference (source of truth)
  currentScriptId: string;           // FK to StrategyScript
  configSchemaId: string;            // FK to StrategyConfigSchema

  // Metadata
  enabled: boolean;
  visibility: 'system' | 'public';
  currentVersion: string;
  importSource: 'custom' | 'hummingbot';

  createdAt: Date;
  updatedAt: Date;
}
```

#### StrategyScript Entity (NEW - DB-based scripts)

```typescript
interface StrategyScript {
  id: string;
  strategyKey: string;               // e.g., "pure_market_making"
  version: string;                   // e.g., "1.0.0"

  // The actual script content (source of truth in DB)
  scriptContent: string;            // TypeScript source code
  scriptHash: string;               // SHA-256 of scriptContent

  // Metadata
  enabled: boolean;
  createdById: string;               // Admin who created this version
  createdAt: Date;
  updatedAt: Date;
}
```

#### StrategyConfigSchema Entity (NEW)

```typescript
interface StrategyConfigSchema {
  id: string;
  strategyKey: string;
  version: string;

  // Schema definition (immutable per version)
  schemaContent: string;             // TOML/JSON schema
  defaultConfig: string;             // JSON default config

  createdAt: Date;
}
```

#### UserStrategyConfig Entity

```typescript
interface UserStrategyConfig {
  id: string;
  userId: string;                    // Mixin user ID
  strategyDefinitionKey: string;     // e.g., "pure_market_making"
  configOverrides: Record<string, any>; // User's overrides
  isDefault: boolean;                // User's default config for this strategy
  createdAt: Date;
  updatedAt: Date;
}
```

**Purpose**: Allows pro users to customize strategy parameters while normal users use defaults.

---

### 2. Config Schema (TOML/JSON)

#### Schema Structure

```toml
# strategy-name.toml

[metadata]
name = "Pure Market Making"
key = "pure_market_making"
version = "1.0.0"
description = "Place buy and sell orders on both sides of the order book"
author = "Mr.Market"

[permissions]
can_be_modified_by_pro_user = true
can_be_exported = true
import_source = "hummingbot"  # "hummingbot" | "custom"

[[parameters]]
# Parameter definition
```

#### Parameter Definition Format

Each parameter defines:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Unique parameter identifier |
| `name` | string | Yes | Display name |
| `type` | string | Yes | Data type: `number`, `boolean`, `string`, `array`, `object` |
| `default` | varies | Yes | Default value (matches type) |
| `min` | number | No | Minimum value (for number type) |
| `max` | number | No | Maximum value (for number type) |
| `enum` | array | No | Allowed values (for enum/selection) |
| `required` | boolean | No | Whether user must provide value |
| `description` | string | Yes | Human-readable explanation |
| `group` | string | No | Logical grouping (e.g., "Risk Management") |
| `advanced` | boolean | No | Hide from normal users, show to pro users only |

#### Example: Pure Market Making

```toml
# pure-market-making.toml

[metadata]
name = "Pure Market Making"
key = "pure_market_making"
version = "1.0.0"
description = "Place buy and sell orders on both sides of the order book"
author = "Mr.Market"

[permissions]
can_be_modified_by_pro_user = true
can_be_exported = true
import_source = "custom"

[[parameters]]
key = "bid_spread"
name = "Bid Spread"
type = "number"
default = 0.001
min = 0
max = 1
description = "Spread from mid price for buy orders (0.001 = 0.1%)"

[[parameters]]
key = "ask_spread"
name = "Ask Spread"
type = "number"
default = 0.001
min = 0
max = 1
description = "Spread from mid price for sell orders (0.001 = 0.1%)"

[[parameters]]
key = "order_amount"
name = "Order Amount"
type = "number"
default = 0.001
min = 0
description = "Amount of base asset per order"

[[parameters]]
key = "order_refresh_time"
name = "Order Refresh Time"
type = "number"
default = 60
min = 1
description = "Seconds between order refresh cycles"
group = "Timing"

[[parameters]]
key = "order_levels"
name = "Order Levels"
type = "number"
default = 1
min = 1
max = 10
description = "Number of order levels to place on each side"
group = "Advanced"

[[parameters]]
key = "order_level_spread"
name = "Order Level Spread"
type = "number"
default = 0.01
min = 0
max = 1
description = "Spread between order levels"
group = "Advanced"
advanced = true

[[parameters]]
key = "max_position"
name = "Maximum Position"
type = "number"
default = 1000
min = 0
description = "Maximum position size to accumulate"
group = "Risk Management"

[[parameters]]
key = "inventory_skew_enabled"
name = "Enable Inventory Skew"
type = "boolean"
default = false
description = "Adjust quoting based on accumulated inventory"
group = "Advanced"

[[parameters]]
key = "inventory_target_base_pct"
name = "Inventory Target Base Percentage"
type = "number"
default = 50
min = 0
max = 100
description = "Target base asset percentage of total portfolio"
group = "Advanced"
advanced = true
```

#### Example: Arbitrage

```toml
# arbitrage.toml

[metadata]
name = "Arbitrage"
key = "arbitrage"
version = "1.0.0"
description = "Cross-exchange arbitrage between two exchanges"
author = "Mr.Market"

[permissions]
can_be_modified_by_pro_user = true
can_be_exported = true
import_source = "hummingbot"

[[parameters]]
key = "min_profitability"
name = "Minimum Profitability"
type = "number"
default = 0.001
min = 0
max = 1
description = "Minimum profit threshold to execute arbitrage (0.001 = 0.1%)"

[[parameters]]
key = "gas_adjustment_factor"
name = "Gas Adjustment Factor"
type = "number"
default = 1.1
min = 1
max = 10
description = "Multiplier for estimated gas costs (DEX only)"

[[parameters]]
key = "order_amount"
name = "Order Amount"
type = "number"
default = 0.001
min = 0
description = "Order amount for arbitrage"

[[parameters]]
key = "max_order_age"
name = "Maximum Order Age"
type = "number"
default = 300
min = 10
description = "Maximum order lifetime in seconds"
group = "Timing"
```

#### Example: Volume Strategy

```toml
# volume.toml

[metadata]
name = "Volume Strategy"
key = "volume"
version = "1.0.0"
description = "Generate trading volume with controlled swaps"
author = "Mr.Market"

[permissions]
can_be_modified_by_pro_user = false
can_be_exported = true
import_source = "custom"

[[parameters]]
key = "execution_mode"
name = "Execution Mode"
type = "string"
default = "amm_dex"
enum = ["amm_dex", "clob_cex", "clob_dex"]
description = "Exchange type to execute on"

[[parameters]]
key = "swap_slippages"
name = "Swap Slippages"
type = "array"
default = [0.01, 0.02, 0.03]
description = "Allowed slippage tolerances"

[[parameters]]
key = "swap_interval"
name = "Swap Interval"
type = "number"
default = 60
min = 1
description = "Seconds between swap cycles"
group = "Timing"

[[parameters]]
key = "max_cycle_count"
name = "Maximum Cycle Count"
type = "number"
default = 1000
min = 1
description = "Maximum number of swap cycles to execute"

[[parameters]]
key = "max_swap_amount_per_cycle"
name = "Maximum Swap Amount Per Cycle"
type = "number"
default = 1000
min = 0
description = "Maximum swap amount per cycle"
group = "Risk Management"
```

#### Alternative: JSON Format

```json
{
  "metadata": {
    "name": "Pure Market Making",
    "key": "pure_market_making",
    "version": "1.0.0",
    "description": "Place buy and sell orders on both sides of the order book",
    "author": "Mr.Market"
  },
  "permissions": {
    "can_be_modified_by_pro_user": true,
    "can_be_exported": true,
    "import_source": "custom"
  },
  "parameters": [
    {
      "key": "bid_spread",
      "name": "Bid Spread",
      "type": "number",
      "default": 0.001,
      "min": 0,
      "max": 1,
      "description": "Spread from mid price for buy orders (0.001 = 0.1%)"
    },
    {
      "key": "ask_spread",
      "name": "Ask Spread",
      "type": "number",
      "default": 0.001,
      "min": 0,
      "max": 1,
      "description": "Spread from mid price for sell orders (0.001 = 0.1%)"
    }
  ]
}
```

---

### 3. Pooled Executor Layer

#### ExecutorRegistry

```typescript
class ExecutorRegistry {
  // Map: "BINANCE:main:BTC-USDT" -> ExchangePairExecutor
  // Key includes account to support multiple API keys/subaccounts
  private executors: Map<string, ExchangePairExecutor> = new Map();

  // Get or create executor for exchange-account-pair
  getOrCreateExecutor(
    exchange: string,
    account: string,   // e.g., "main", "subaccount-1", "api-key-1"
    pair: string
  ): ExchangePairExecutor;

  // Remove executor when no orders remain
  removeExecutor(exchange: string, account: string, pair: string): void;

  // Get all active executors
  getActiveExecutors(): ExchangePairExecutor[];
}
```

**Purpose**: Manages lifecycle of pooled executors per exchange-account-pair.

#### ExchangePairExecutor

```typescript
class ExchangePairExecutor implements TickComponent {
  readonly exchange: string;
  readonly account: string;  // NEW: supports multiple API keys per exchange
  readonly pair: string;

  // Shared resources per executor
  private marketDataProvider: MarketDataProvider;
  private orderBookTracker: OrderBookTracker;
  private privateStreamTracker: PrivateStreamTracker;
  private clientOrderTracker: ClientOrderTracker;

  // Campaign tracking (Redis-based, non-blocking)
  private tradeAggregator: InMemoryTradeAggregator;

  // Balance management (EXISTING - reuses BalanceLedgerService)
  private balanceLedger: BalanceLedgerService;

  // Per-order isolation
  private strategySessions: Map<string, StrategySession> = new Map();

  // Lifecycle - with balance reservation (P3)
  async addOrder(
    orderId: string,
    userId: string,
    account: string,            // NEW: account for executor key
    campaignId: string | null,  // campaign context
    strategyConfig: RuntimeConfig
  ): Promise<StrategySession> {
    // 1. Estimate required balance for this strategy
    const requiredBalance = this.estimateRequiredBalance(strategyConfig, strategyConfig.pair);

    // 2. Use EXISTING BalanceLedgerService.lockFunds()
    const lockResult = await this.balanceLedger.lockFunds({
      userId: userId,
      assetId: this.getBaseAsset(strategyConfig.pair),  // e.g., "BTC"
      amount: requiredBalance.base.toString(),
      idempotencyKey: `reserve:${orderId}`,
      refType: 'MARKET_MAKING_ORDER',
      refId: orderId,
    });

    // 3. Verify lock succeeded (fails fast if insufficient balance)
    if (!lockResult.balance.availableBalance.gte(requiredBalance.base)) {
      throw new Error(
        `Insufficient balance for ${strategyConfig.pair}: ` +
        `need ${requiredBalance.base}, have ${lockResult.balance.availableBalance}`
      );
    }

    // 4. Create session with reservation info
    const session = new StrategySession({
      orderId,
      userId,
      account,
      runtimeConfig: strategyConfig,
      reservation: {
        lockedAmount: requiredBalance.base,
        lockedAt: new Date(),
      },
    });

    // 5. Add to executor
    this.strategySessions.set(orderId, session);

    return session;
  }

  // Also releases balance reservation on stop
  async removeOrder(orderId: string): Promise<void> {
    const session = this.strategySessions.get(orderId);

    // 1. Release balance reservation using existing unlockFunds()
    if (session?.reservation) {
      await this.balanceLedger.unlockFunds({
        userId: session.userId,
        assetId: session.baseAsset,
        amount: session.reservation.lockedAmount,
        idempotencyKey: `release:${orderId}`,
        refType: 'MARKET_MAKING_ORDER',
        refId: orderId,
      });
    }

    // 2. Flush Redis data to SQLite
    await this.tradeAggregator.flushOrder(orderId, new Date());

    // 3. Remove session
    this.strategySessions.delete(orderId);
  }

  // Tick execution (drives all sessions)
  async onTick(ts: string): Promise<void>;

  // Fill handling via PrivateStreamTracker
  async onFill(fill: OrderFill): Promise<void>;

  // Health check
  async health(): Promise<boolean>;
}
```

**Key Design Decisions**:
- **Shared market data**: All sessions use same OrderBookTracker (market truth)
- **Isolated session state**: Each order has its own StrategySession
- **Non-blocking trade recording**: Redis HINCRBY, no DB writes on fills
- **Campaign context**: Each order knows its campaign
- **Flush on stop**: When order stops, flush Redis data to SQLite

#### StrategySession

```typescript
class StrategySession {
  readonly orderId: string;
  readonly userId: string;
  readonly strategyKey: string;
  readonly runtimeConfig: RuntimeConfig;

  // Session state (isolated from other sessions)
  private state: StrategySessionState;
  private strategyScript: IStrategyScript;

  // Execution lifecycle
  async initialize(strategyScript: IStrategyScript): Promise<void>;

  async onTick(marketData: MarketDataSnapshot): Promise<ExecutorAction[]>;

  async onOrderFilled(fill: OrderFill): Promise<ExecutorAction[]>;

  async onError(error: Error): Promise<ExecutorAction[]>;

  async terminate(): Promise<void>;

  // State management
  getState(): StrategySessionState;
  updateState(updates: Partial<StrategySessionState>): void;
}
```

**Purpose**: Provides per-order isolation while sharing execution context.

---

### 4. Execution Script Layer

#### IStrategyScript Interface

Every execution script must implement this interface:

```typescript
import BigNumber from 'bignumber.js';

/**
 * Interface for strategy execution scripts
 * All strategy scripts must implement this interface
 */
export interface IStrategyScript {
  /**
   * Unique identifier for this strategy
   * Must match the key in config schema
   */
  readonly strategyKey: string;

  /**
   * Version of this script
   * Used for tracking script changes
   */
  readonly version: string;

  /**
   * Validate the runtime configuration before execution
   *
   * @param config - Runtime config (defaults + user overrides merged)
   * @returns true if config is valid, false otherwise
   */
  validateConfig(config: RuntimeConfig): boolean;

  /**
   * Create a new session state for an order
   *
   * @param config - Validated runtime config
   * @returns Initial session state object
   */
  createSession(config: RuntimeConfig): SessionState;

  /**
   * Called on each tick to determine trading actions
   *
   * @param session - The session state (mutates this in place)
   * @param marketData - Current market data snapshot
   * @returns Array of actions to execute (may be empty)
   */
  onTick(
    session: SessionState,
    marketData: MarketDataSnapshot
  ): ExecutorAction[];

  /**
   * Called when an order is filled
   *
   * @param session - The session state (mutates this in place)
   * @param fill - Fill event details
   * @returns Array of follow-up actions (may be empty)
   */
  onFill(
    session: SessionState,
    fill: FillEvent
  ): ExecutorAction[];

  /**
   * Called when an error occurs
   *
   * @param session - The session state (mutates this in place)
   * @param error - The error that occurred
   * @returns Array of recovery actions (may be empty)
   */
  onError(
    session: SessionState,
    error: Error
  ): ExecutorAction[];
}
```

#### Type Definitions

```typescript
/**
 * Runtime configuration passed to scripts
 * Merged from: defaultConfig + userConfigOverrides
 */
interface RuntimeConfig {
  // Order identity
  orderId: string;
  userId: string;
  exchange: string;
  pair: string;
  campaignId?: string;

  // All strategy parameters (from config schema)
  [key: string]: any;

  // Execution context
  executionContext: {
    tickSizeMs: number;
    maxOrderAge: number;
    minOrderAge: number;
    // ... other execution context
  };
}

/**
 * Session state maintained by the script
 * Opaque to the script - can be any structure
 */
interface SessionState {
  // Script can define any structure
  [key: string]: any;
}

/**
 * Market data snapshot provided on each tick
 */
interface MarketDataSnapshot {
  // Order book data
  bestBid: string;        // Best bid price
  bestAsk: string;        // Best ask price
  bidVolume: string;     // Volume at best bid
  askVolume: string;     // Volume at best ask

  // Mid price (derived)
  midPrice: string;

  // Timestamp
  timestamp: number;

  // Additional market data (as needed)
  [key: string]: any;
}

/**
 * Fill event from exchange
 */
interface FillEvent {
  // Order details
  orderId: string;
  exchangeOrderId: string;
  side: 'BUY' | 'SELL';

  // Execution details
  executionType: 'maker' | 'taker';
  filledAmount: string;   // Actual filled amount
  price: string;

  // Timestamp
  timestamp: number;

  // Additional fill data
  [key: string]: any;
}

/**
 * Action to be executed on exchange
 */
interface ExecutorAction {
  // Action type
  type: 'CREATE_LIMIT_ORDER'
      | 'CANCEL_ORDER'
      | 'STOP_EXECUTOR'
      | 'UPDATE_ORDER';

  // Action-specific fields
  [key: string]: any;
}
```

#### ScriptLoader (Hot Reload)

```typescript
class StrategyScriptLoader {
  private cache: Map<string, IStrategyScript> = new Map();

  async loadScript(scriptPath: string): Promise<IStrategyScript> {
    // Clear require cache to force reload
    delete require.cache[require.resolve(scriptPath)];

    // Import the script module
    const scriptModule = await import(scriptPath);

    // Get the script class (should be default export)
    const ScriptClass = scriptModule.default;

    // Create instance
    const script = new ScriptClass();

    // Verify it implements the interface
    if (!this.isValidScript(script)) {
      throw new Error(`Script at ${scriptPath} does not implement IStrategyScript`);
    }

    // Cache it
    this.cache.set(script.strategyKey, script);

    return script;
  }

  // NEW: DB-based script loading (source of truth)
  async loadScriptFromDB(scriptId: string): Promise<IStrategyScript> {
    // 1. Fetch script content from DB
    const scriptEntity = await this.strategyScriptRepository.findOne({
      where: { id: scriptId }
    });

    if (!scriptEntity) {
      throw new Error(`Script not found: ${scriptId}`);
    }

    // 2. Verify hash matches (tamper detection)
    const contentHash = this.computeHash(scriptEntity.scriptContent);
    if (contentHash !== scriptEntity.scriptHash) {
      throw new Error(`Script hash mismatch for ${scriptId} - possible tampering`);
    }

    // 3. Compile TypeScript at runtime
    const compiled = await this.compileTypeScript(scriptEntity.scriptContent);

    // 4. Create instance
    const script = new compiled.default();

    // 5. Verify it implements the interface
    if (!this.isValidScript(script)) {
      throw new Error(`Script ${scriptId} does not implement IStrategyScript`);
    }

    // 6. Cache by script ID
    this.cache.set(scriptEntity.id, script);

    return script;
  }

  // NEW: Load script for a specific order (uses captured script reference)
  async loadScriptForOrder(orderId: string): Promise<IStrategyScript> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId }
    });

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // For active/running orders, use the captured script reference
    // This ensures reproducibility - order runs same logic as when created
    return this.loadScriptFromDB(order.strategyScriptId);
  }

  // NEW: Publish new script version (DB update, not filesystem)
  async publishScriptVersion(
    strategyKey: string,
    version: string,
    scriptContent: string,
    createdById: string
  ): Promise<StrategyScript> {
    const scriptHash = this.computeHash(scriptContent);

    // Compile to verify syntax before saving
    await this.compileTypeScript(scriptContent);

    const script = await this.strategyScriptRepository.save({
      strategyKey,
      version,
      scriptContent,
      scriptHash,
      enabled: true,
      createdById,
    });

    // Update definition to point to new script
    await this.strategyDefinitionRepository.update(
      { key: strategyKey },
      { currentScriptId: script.id }
    );

    return script;
  }

  private isValidScript(script: any): script is IStrategyScript {
    return (
      typeof script.strategyKey === 'string' &&
      typeof script.version === 'string' &&
      typeof script.validateConfig === 'function' &&
      typeof script.createSession === 'function' &&
      typeof script.onTick === 'function' &&
      typeof script.onFill === 'function' &&
      typeof script.onError === 'function'
    );
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private async compileTypeScript(source: string): Promise<any> {
    // Use TypeScript compiler to compile at runtime
    const result = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS }
    });
    const jsCode = result.outputText;
    // Execute in sandboxed context...
    return eval(jsCode);
  }
}

// NEW: Seeder - Load template scripts to DB on server start
async function seedStrategyScripts(dataSource: DataSource) {
  const templates = [
    {
      strategyKey: 'pure_market_making',
      version: '1.0.0',
      scriptContent: await fs.readFile('seeds/strategies/pure-market-making.ts', 'utf-8'),
    },
    {
      strategyKey: 'arbitrage',
      version: '1.0.0',
      scriptContent: await fs.readFile('seeds/strategies/arbitrage.ts', 'utf-8'),
    },
    {
      strategyKey: 'volume',
      version: '1.0.0',
      scriptContent: await fs.readFile('seeds/strategies/volume.ts', 'utf-8'),
    },
  ];

  for (const template of templates) {
    const existing = await dataSource.getRepository(StrategyScript).findOne({
      where: { strategyKey: template.strategyKey, version: template.version }
    });

    if (!existing) {
      const hash = createHash('sha256').update(template.scriptContent).digest('hex');
      await dataSource.getRepository(StrategyScript).save({
        ...template,
        scriptHash: hash,
        enabled: true,
        createdById: 'system',
      });
    }
  }
}
```

#### Example Script: Pure Market Making

```typescript
// strategies/scripts/pure-market-making.ts

import BigNumber from 'bignumber.js';
import {
  IStrategyScript,
  RuntimeConfig,
  SessionState,
  MarketDataSnapshot,
  FillEvent,
  ExecutorAction,
} from '../types';

export class PureMarketMakingStrategy implements IStrategyScript {
  readonly strategyKey = 'pure_market_making';
  readonly version = '1.0.0';

  validateConfig(config: RuntimeConfig): boolean {
    return (
      typeof config.bid_spread === 'number' &&
      typeof config.ask_spread === 'number' &&
      typeof config.order_amount === 'number' &&
      typeof config.order_levels === 'number' &&
      typeof config.order_refresh_time === 'number' &&
      BigNumber(config.order_amount).isFinite() &&
      BigNumber(config.bid_spread).isFinite() &&
      BigNumber(config.ask_spread).isFinite()
    );
  }

  createSession(config: RuntimeConfig): SessionState {
    return {
      orderId: config.orderId,
      userId: config.userId,
      lastTickTime: 0,
      activeOrders: [],
      position: {
        base: '0',
        quote: '0',
      },
      totalTradedVolume: '0',
    };
  }

  onTick(
    session: SessionState,
    marketData: MarketDataSnapshot
  ): ExecutorAction[] {
    const actions: ExecutorAction[] = [];
    const config = session.runtimeConfig as RuntimeConfig;

    // Calculate mid price
    const midPrice = BigNumber(marketData.bestBid)
      .plus(marketData.bestAsk)
      .div(2);

    const now = Date.now();
    const shouldRefresh =
      now - session.lastTickTime >= config.order_refresh_time * 1000;

    if (shouldRefresh) {
      // Cancel existing orders
      for (const order of session.activeOrders) {
        actions.push({
          type: 'CANCEL_ORDER',
          orderId: order.exchangeOrderId,
        });
      }

      // Place new orders
      for (let level = 0; level < config.order_levels; level++) {
        const levelSpread = config.order_level_spread * level;

        const bidPrice = midPrice
          .multipliedBy(1 - config.bid_spread - levelSpread)
          .toFixed();
        const askPrice = midPrice
          .multipliedBy(1 + config.ask_spread + levelSpread)
          .toFixed();

        actions.push({
          type: 'CREATE_LIMIT_ORDER',
          side: 'BUY',
          price: bidPrice,
          amount: config.order_amount,
          clientId: `${config.orderId}-bid-${level}`,
        });

        actions.push({
          type: 'CREATE_LIMIT_ORDER',
          side: 'SELL',
          price: askPrice,
          amount: config.order_amount,
          clientId: `${config.orderId}-ask-${level}`,
        });
      }

      session.lastTickTime = now;
    }

    return actions;
  }

  onFill(session: SessionState, fill: FillEvent): ExecutorAction[] {
    // Update position
    const filledAmount = BigNumber(fill.filledAmount);

    if (fill.side === 'BUY') {
      session.position.base = BigNumber(session.position.base)
        .plus(filledAmount)
        .toFixed();
    } else {
      session.position.base = BigNumber(session.position.base)
        .minus(filledAmount)
        .toFixed();
    }

    // Update traded volume
    session.totalTradedVolume = BigNumber(session.totalTradedVolume)
      .plus(filledAmount)
      .toFixed();

    // Remove filled order from active orders
    session.activeOrders = session.activeOrders.filter(
      o => o.exchangeOrderId !== fill.exchangeOrderId
    );

    // Re-quote immediately
    return this.onTick(session, { ...fill, midPrice: fill.price });
  }

  onError(session: SessionState, error: Error): ExecutorAction[] {
    console.error(`Strategy error for order ${session.orderId}:`, error);

    // Cancel all active orders
    return session.activeOrders.map(order => ({
      type: 'CANCEL_ORDER',
      orderId: order.exchangeOrderId,
    }));
  }
}
```

---

### 5. Config Resolution Flow

```typescript
// Config resolution happens in StrategyConfigResolverService

class StrategyConfigResolverService {
  async resolveConfig(
    strategyDefinitionKey: string,
    userId?: string,
    orderId?: string
  ): Promise<RuntimeConfig> {
    const definition = await this.strategyDefinitionRepository.findOne({
      where: { key: strategyDefinitionKey }
    });

    if (!definition) {
      throw new Error(`Strategy not found: ${strategyDefinitionKey}`);
    }

    // 1. Load default config from definition
    let config = { ...definition.defaultConfig };

    // 2. Apply user overrides if pro user
    if (userId && orderId) {
      const userConfig = await this.userStrategyConfigRepository.findOne({
        where: {
          userId,
          strategyDefinitionKey: strategyDefinitionKey
        }
      });

      if (userConfig && userConfig.configOverrides) {
        config = { ...config, ...userConfig.configOverrides };
      }
    }

    // 3. Add execution context
    config.executionContext = {
      tickSizeMs: Number(this.configService.get('STRATEGY_TICK_SIZE_MS', 1000)),
      // ... other context
    };

    // 4. Add order identity (if provided)
    if (orderId) {
      config.orderId = orderId;
    }

    // 5. Get campaign for this exchange-pair
    if (orderId) {
      const order = await this.orderRepository.findOne({ where: { id: orderId } });
      if (order) {
        const campaign = await this.getActiveCampaign(order.exchange, order.pair);
        config.campaignId = campaign?.id;
      }
    }

    // 6. Validate against schema
    const valid = this.validateAgainstSchema(config, definition.configSchema);
    if (!valid) {
      throw new Error('Invalid configuration');
    }

    return config as RuntimeConfig;
  }
}
```

---

### 6. Campaign Integration (Separate from Strategy)

Campaigns are **NOT** part of strategy definition. They are linked at the **exchange-pair** level.

```typescript
// Campaign is linked to exchange-pair, not strategy
class CampaignLinker {
  async getActiveCampaign(exchange: string, pair: string): Promise<Campaign | null> {
    // Find active campaign for this exchange-pair
    return await this.campaignRepository.findOne({
      where: {
        exchange,
        pair,
        state: 'active',
        startDate: LessThanOrEqual(new Date()),
        endDate: GreaterThanOrEqual(new Date()),
      }
    });
  }

  // When order starts, it inherits the active campaign for its pair
  async linkOrderToCampaign(orderId: string): Promise<void> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });

    if (order) {
      const campaign = await this.getActiveCampaign(order.exchange, order.pair);

      // Campaign is stored on order, not in strategy
      order.campaignId = campaign?.id;
      await this.orderRepository.save(order);
    }
  }
}
```

**Key Points:**
- Strategy has NO knowledge of campaigns
- Campaigns are determined by exchange-pair
- All orders on same pair use same campaign
- Order references campaignId, but strategy doesn't care

---

### 7. Redis-Based Trade Aggregation

#### Design Principles

**IMPORTANT**: To handle SQLite's write limitations, the campaign tracking system uses:
- **Redis for real-time aggregation** (no DB writes on each fill)
- **SQLite for persistent storage** (only daily summaries)
- **Same system for order history and campaign tracking**

This design reduces DB writes from ~400/second to ~100/day (a 17,000× reduction).

#### InMemoryTradeAggregator

```typescript
/**
 * InMemoryTradeAggregator - Uses Redis for real-time aggregation
 *
 * Key design: NO database writes on each fill!
 * Only writes to Redis (HINCRBY), which is O(1) and super fast.
 *
 * Data is persisted to SQLite only:
 * 1. When an order stops (flush that order's data)
 * 2. During daily reward processing (write all active orders)
 */
class InMemoryTradeAggregator {
  private redis: Redis;
  private readonly TTL_SECONDS = 72 * 3600; // 72 hours

  /**
   * Record a trade - REDIS ONLY, no DB write
   *
   * Uses atomic HINCRBY in Redis. No SQLite write.
   */
  async recordTrade(tradeData: TradeData): Promise<void> {
    const dateKey = this.toDateKey(new Date(tradeData.timestamp));
    const key = `trade:${tradeData.orderId}:${dateKey}`;

    // Atomic increment in Redis (O(1), super fast!)
    const multi = this.redis.multi();

    switch (tradeData.tradeType) {
      case 'MAKER':
        multi.hincrbyfloat(key, 'maker_volume', tradeData.volume);
        break;
      case 'TAKER_BUY':
        multi.hincrbyfloat(key, 'taker_buy_volume', tradeData.volume);
        break;
      case 'TAKER_SELL':
        multi.hincrbyfloat(key, 'taker_sell_volume', tradeData.volume);
        break;
    }

    // Calculate score
    const weight = TRADE_WEIGHTS[tradeData.tradeType];
    const score = BigNumber(tradeData.volume).multipliedBy(weight);
    multi.hincrbyfloat(key, 'total_score', score.toFixed());
    multi.hincrby(key, 'trade_count', 1);

    // Store metadata
    multi.hset(key, 'user_id', tradeData.userId);
    multi.hset(key, 'exchange', tradeData.exchange);
    multi.hset(key, 'pair', tradeData.pair);
    if (tradeData.campaignId) {
      multi.hset(key, 'campaign_id', tradeData.campaignId);
    }

    // Set TTL (auto-cleanup after 72 hours)
    multi.expire(key, this.TTL_SECONDS);

    await multi.exec();
  }

  /**
   * Flush order's data to SQLite (called when order stops)
   */
  async flushOrder(orderId: string, date: Date): Promise<void> {
    const summary = await this.getOrderDailySummary(orderId, date);
    if (summary) {
      await this.orderDailySummaryRepository.upsert({
        orderId: orderId,
        date: this.toDateKey(date),
        makerVolume: summary.makerVolume.toFixed(),
        takerBuyVolume: summary.takerBuyVolume.toFixed(),
        takerSellVolume: summary.takerSellVolume.toFixed(),
        totalScore: summary.totalScore.toFixed(),
        tradeCount: summary.tradeCount,
        updatedAt: new Date(),
      });
    }
  }
}
```

#### OrderDailySummary Entity (SQLite)

```typescript
/**
 * Daily summary - ONE record per order per day
 *
 * Replaces CampaignTradeRecord and OrderRevenueRecord.
 * Written ONLY when order stops or during daily reward processing.
 */
interface OrderDailySummary {
  id: string;
  orderId: string;
  date: string;                    // "YYYY-MM-DD"

  // Trading activity (aggregated for the day)
  makerVolume: string;             // Total MAKER volume
  takerBuyVolume: string;          // Total TAKER_BUY volume
  takerSellVolume: string;         // Total TAKER_SELL volume
  totalScore: string;              // Weighted score (volume × weight)
  tradeCount: number;              // Number of trades

  // Reward attribution (filled after reward calculation)
  attributedReward?: string;

  createdAt: Date;
  updatedAt: Date;
}
```

#### PrivateStreamTracker Integration

```typescript
/**
 * Fill detection via existing PrivateStreamTracker
 *
 * When a fill arrives:
 * 1. Determine if MAKER or TAKER from exchange data
 * 2. Record to Redis (InMemoryTradeAggregator)
 * 3. No SQLite write yet!
 */
class FillEventHandler {
  async onFill(fill: OrderFill): Promise<void> {
    // Determine MAKER/TAKER from exchange
    const tradeType = fill.executionType === 'maker'
      ? 'MAKER'
      : fill.side === 'BUY' ? 'TAKER_BUY' : 'TAKER_SELL';

    // Record to Redis (super fast, no DB write)
    await this.tradeAggregator.recordTrade({
      orderId: fill.orderId,
      userId: fill.userId,
      exchange: fill.exchange,
      pair: fill.pair,
      campaignId: fill.campaignId,
      tradeType: tradeType,
      volume: fill.filledAmount, // Use FILLED amount, not order amount!
      price: fill.price,
      timestamp: fill.timestamp,
    });
  }
}
```

#### Daily Reward Processing

```typescript
class CampaignRewardAccounting {
  /**
   * Process daily rewards - reads from Redis, writes to SQLite
   *
   * Called by cron (midnight UTC, configurable by admin)
   */
  async processDailyRewards(campaignId: string, date: Date): Promise<void> {
    // Step 1: Get total daily volume from Redis
    const totalVolume = await this.tradeAggregator.getTotalDailyVolume(date);

    // Step 2: Determine reward pool
    const dailyPool = campaign.totalFund.div(campaign.durationDays);
    const actualPool = totalVolume.gte(campaign.dailyTarget)
      ? dailyPool
      : dailyPool.mul(totalVolume.div(campaign.dailyTarget));

    // Step 3: Get all scores from Redis
    const dailyScores = await this.tradeAggregator.getDailyScores(date);

    // Step 4: Calculate and write rewards
    // ... (same as before, but reads from Redis, writes summaries to SQLite)
  }
}
```

#### Order Stop Handling

```typescript
class OrderLifecycleManager {
  /**
   * When order stops, flush its Redis data to SQLite
   * This ensures no data loss if order runs for short period
   */
  async onOrderStop(orderId: string): Promise<void> {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Flush today's data
    await this.tradeAggregator.flushOrder(orderId, today);

    // Also flush yesterday if exists (in case order spanned midnight)
    await this.tradeAggregator.flushOrder(orderId, yesterday);
  }
}
```

#### Reconciliation (via Exchange API)

```typescript
class ReconciliationService {
  /**
   * Reconcile trades by querying exchange API
   * Links exchange order IDs to internal records
   */
  async reconcile(orderId: string, date: Date): Promise<void> {
    // Get our recorded trades
    const ourTrades = await this.tradeAggregator.getOrderDailySummary(orderId, date);

    // Query exchange API for actual trades
    const exchangeTrades = await this.exchangeApi.getTrades(orderId);

    // Filter for successful trades only
    const successfulTrades = exchangeTrades.filter(t => t.status === 'closed');

    // Compare and fix any discrepancies
    // ...
  }
}
```

#### Configuration

```typescript
// Timezone configuration
const config = {
  // Default UTC, can be overridden by admin
  timezone: process.env.CAMPAIGN_TIMEZONE || 'UTC',

  // Redis TTL for trade data (72 hours)
  tradeDataTTL: 72 * 3600,

  // Daily cron time (default midnight UTC)
  rewardProcessingCron: process.env.CAMPAIGN_REWARD_CRON || '0 0 * * *',
};
```

---

## Complete Execution Flows

### 1. User Order Creation Flow

```
1. USER CREATES ORDER (Mixin)
   └─ User transfers funds to bot via Mixin
   └─ Mixin snapshot arrives: "HMT: create MM order"

2. SNAPSHOT PROCESSING (snapshots.service.ts)
   └─ process_snapshot validates memo/version/trading type
   └─ Check if MarketMakingOrderIntent exists and is active
   └─ Enqueue process_market_making_snapshots

3. PAYMENT VERIFICATION (market-making.processor.ts)
   └─ Validate grow pair is enabled
   └─ Compute required fees
   └─ Build/update MarketMakingPaymentState
   └─ check_payment_complete until complete/timeout
   └─ Handle refund paths on invalid/timeout/error

4. FUNDS MOVEMENT
   └─ withdraw_to_exchange (if enabled)
   └─ monitor_mixin_withdrawal
   └─ join_campaign (creates local campaign participation)

5. START MARKET MAKING (start_mm)
   └─ Resolve strategyDefinitionKey from order
   └─ Get StrategyDefinition (config schema + script path)
   └─ Resolve Config: defaultConfig + userConfigOverrides → RuntimeConfig
   └─ Bind to ExchangePairExecutor (get or create for exchange-account-pair)
   └─ Create StrategySession with runtime config
   └─ Load execution script from DB (StrategyScript table)
   └─ Capture strategySnapshot in MarketMakingOrder for reproducibility
```

### 2. Execution Loop Flow

```
ClockTickCoordinator ticks at global cadence (e.g., 1s)
   │
   ▼
For each ExchangePairExecutor:
   │
   ├─ OrderBookTracker.onTick() (market data)
   ├─ PrivateStreamTracker.onTick() (user fills)
   │
   ▼
   For each StrategySession in executor:
   │  │
   │  ├─ Load market data snapshot from MarketDataProvider
   │  │
   │  ├─ Call strategyScript.onTick(session, marketData)
   │  │
   │  ├─ Receive ExecutorAction[]
   │  │
   │  └─ Pass actions to ExecutorOrchestrator
   │
   ▼
ExecutorOrchestrator.dispatchActions()
   │
   ├─ Convert actions to StrategyOrderIntent[]
   │
   ├─ StrategyIntentStore.upsertIntent() (persist to DB)
   │
   └─ If intent_execution_driver=sync:
       └─ Execute immediately
      If intent_execution_driver=worker:
       └─ Queue for async execution
```

### 3. Intent Execution Flow

```
StrategyIntentWorker polls pending intents
   │
   ▼
For each pending intent:
   │
   ├─ Safety gates (max in-flight, per-exchange limits)
   │
   ├─ StrategyIntentExecution.execute()
   │  │
   │  ├─ ExchangeConnectorAdapter.placeLimitOrder()
   │  │
   │  ├─ Update ClientOrderTracker (shadow ledger)
   │  │
   │  └─ Handle success/failure/retry
   │
   ├─ Update intent status (NEW → PROCESSING → DONE/FAILED)
   │
   └─ If fill detected:
       │
       ├─ Update session state
       │
       ├─ Determine MAKER/TAKER from exchange
       │
       ├─ Record to Redis (InMemoryTradeAggregator.recordTrade)
       │  └─ HINCRBY: atomic, O(1), no DB write
       │
       └─ Return immediately
```

### 4. Campaign Reward Flow

```
Daily cron (midnight UTC, configurable timezone)
   │
   ▼
CampaignService.processDailyRewards(campaignId, date)
   │
   ├─ 1. Read total daily volume from Redis
   │   └─ trade:*:{date} SCAN + sum
   │
   ├─ 2. Determine reward pool
   │   ├─ dailyPool = totalFund / durationDays
   │   └─ If totalVolume ≥ target → full pool
   │       If totalVolume < target → proportional reduction
   │
   ├─ 3. Get all scores from Redis
   │   └─ trade:*:{date} SCAN + get total_score
   │
   ├─ 4. Calculate scores per ORDER
   │
   ├─ 5. Attribute rewards to each ORDER
   │   └─ Write OrderDailySummary to SQLite (ONE per order)
   │
   ├─ 6. Aggregate rewards by user
   │
   └─ 7. Distribute rewards to users
       └─ BalanceLedger.creditReward({
            idempotencyKey: `reward:${campaignId}:${date}:${userId}`
          })
```

### 5. Order Stop Flow (Flush Redis Data)

```
User stops order (or order completes)
   │
   ▼
OrderLifecycleManager.onOrderStop(orderId)
   │
   ├─ Get today's date
   ├─ Get yesterday's date
   │
   ├─ Flush Redis data to SQLite for each date:
   │   └─ InMemoryTradeAggregator.flushOrder(orderId, date)
   │       └─ Read from Redis → Write OrderDailySummary
   │
   └─ Clear Redis keys for this order
```

### 6. Reconciliation Flow (Fallback)

```
If Redis data is lost or inconsistent
   │
   ▼
ReconciliationService.reconcile(orderId, date)
   │
   ├─ Query exchange API for order's trades
   │   └─ Filter: status = 'closed' (successful fills only)
   │
   ├─ Get our recorded data from Redis
   │
   ├─ Compare and fix discrepancies
   │
   └─ Update OrderDailySummary with corrected data
```

---

## Performance Considerations

### Write Frequency Comparison

| Scenario | Approach | DB Writes/Second |
|----------|----------|-----------------|
| **Before (per-fill)** | Write each fill to SQLite | 400 |
| **After (Redis-based)** | Redis HINCRBY only, SQLite daily | 0.001 |

### Redis vs SQLite for Campaign Tracking

```
┌─────────────────────────────────────────────────────────────────┐
│                    Market Making Hot Path                        │
│                  (Must be < 1ms, unchanged)                    │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼ (Redis HINCRBY - O(1), super fast)
┌─────────────────────────────────────────────────────────────────┐
│                    Redis (Real-Time)                              │
│  Key: "trade:{orderId}:{date}"                                  │
│  Fields: maker_volume, taker_buy_volume, taker_sell_volume,     │
│          total_score, trade_count                               │
│                                                                  │
│  Operations: ALL IN-MEMORY, NO DB WRITES                       │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼ (read, not write)
┌─────────────────────────────────────────────────────────────────┐
│              Daily Reward Calculation (Midnight Cron)              │
│  - Read from Redis                                              │
│  - Calculate rewards                                             │
│  - Write ONE summary per order to SQLite                        │
└─────────────────────────────────────────────────────────────────┘
```

### Hot Path Latency

The market making execution loop must be extremely fast. Here's how we minimize latency:

| Operation | Latency | Optimization |
|-----------|---------|--------------|
| Fill arrives from exchange | 0ms | WebSocket event |
| Session state update | < 0.1ms | In-memory operation |
| Redis HINCRBY | < 0.5ms | Atomic, O(1) operation |
| **Total added latency** | **< 1ms** | ✅ Non-blocking |

### Why This Works

1. **Redis HINCRBY** is atomic and O(1) - extremely fast
2. **No SQLite writes on hot path** - only reads from Redis
3. **SQLite writes only happen**:
   - When order stops (flush that order's data)
   - During daily reward processing (one write per order per day)
4. **Redis AOF persistence** survives restarts

### Redis Required - No Fallback (P4)

Redis is a **required dependency** - no fallback allowed. If Redis is unavailable, the server fails fast on startup.

```typescript
class InMemoryTradeAggregator {
  private redis: Redis;

  constructor() {
    // CRITICAL: Fail fast if Redis unavailable
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('[FATAL] Redis unavailable - cannot start without Redis');
          process.exit(1);
        }
        return Math.min(times * 100, 3000);
      },
    });

    this.redis.on('error', (err) => {
      console.error('[FATAL] Redis error:', err);
      process.exit(1);
    });
  }

  async onModuleInit() {
    try {
      await this.redis.ping();
      console.log('✅ Redis connection verified');
    } catch (err) {
      console.error('[FATAL] Cannot start without Redis:', err);
      process.exit(1);
    }
  }

  // No fallback - if Redis is down, this throws
  async recordTrade(tradeData: TradeData): Promise<void> {
    await this.redis.hincrbyfloat(...);
  }
}
```

**Rationale:**
- No silent data loss
- Operational clarity: Redis is required, not optional
- Simpler code without fallback logic
- Fail fast prevents inconsistent state

---

## Importing Hummingbot Strategies

### YAML Import Feature

Admin can import Hummingbot YAML configs via admin page:

```typescript
// POST /admin/strategy/definitions/import-hummingbot
// Body: multipart/form-data with YAML file

async importHummingbotYAML(yamlContent: string): Promise<StrategyDefinition> {
  // Parse Hummingbot YAML
  const hummingbotConfig = parseHummingbotYAML(yamlContent);

  // Convert to our TOML/JSON format
  const configSchema = convertToMrMarketConfig(hummingbotConfig);

  // Create strategy definition
  const definition = this.strategyDefinitionRepository.create({
    key: hummingbotConfig.strategy,
    name: `${hummingbotConfig.strategy} (Imported)`,
    description: `Imported from Hummingbot`,
    configSchema: configSchema,
    defaultConfig: hummingbotConfig.parameters,
    importSource: 'hummingbot',
    permissions: {
      can_be_modified_by_pro_user: false,  // Imported strategies are locked
      can_be_exported: true,
    },
  });

  return definition;
}
```

### Hummingbot YAML Example

```yaml
# Hummingbot pure_market_marketing_config.yml
strategy: pure_market_making

order_levels: 1
order_level_spread: 0.01

bid_spread: 0.001
ask_spread: 0.001

order_amount: 0.001
order_refresh_time: 60
max_order_age: 1800
order_refresh_tolerance_pct: 0.0

inventory_skew_enabled: false
inventory_target_base_pct: 50

inventory_range_multiplier: 1
price_ceiling: -1
price_floor: -1

hanging_orders_enabled: false
hanging_orders_cancel_pct: 0.01
```

**Converted to TOML:**

```toml
[metadata]
name = "Pure Market Making"
key = "pure_market_making"
version = "1.0.0"
description = "Imported from Hummingbot"
author = "Hummingbot"
import_source = "hummingbot"

[permissions]
can_be_modified_by_pro_user = false  # Locked for imported strategies

[[parameters]]
key = "order_levels"
name = "Order Levels"
type = "number"
default = 1
min = 1
max = 10

[[parameters]]
key = "bid_spread"
name = "Bid Spread"
type = "number"
default = 0.001
min = 0
max = 1

[[parameters]]
key = "ask_spread"
name = "Ask Spread"
type = "number"
default = 0.001
min = 0
max = 1

# ... (other parameters)
```

---

## Validation Rules

### Config Schema Validation

```typescript
class ConfigSchemaValidator {
  validateConfig(
    config: Record<string, any>,
    schema: ParameterDefinition[]
  ): ValidationResult {
    const errors: string[] = [];

    for (const param of schema) {
      const value = config[param.key];

      // Check required fields
      if (param.required && value === undefined) {
        errors.push(`Missing required field: ${param.name}`);
        continue;
      }

      // Skip validation if value is undefined
      if (value === undefined) {
        continue;
      }

      // Type validation
      switch (param.type) {
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`${param.name} must be a number`);
          }
          if (param.min !== undefined && value < param.min) {
            errors.push(`${param.name} must be >= ${param.min}`);
          }
          if (param.max !== undefined && value > param.max) {
            errors.push(`${param.name} must be <= ${param.max}`);
          }
          break;

        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`${param.name} must be a boolean`);
          }
          break;

        case 'string':
          if (typeof value !== 'string') {
            errors.push(`${param.name} must be a string`);
          }
          break;

        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`${param.name} must be an array`);
          }
          break;
      }

      // Enum validation
      if (param.enum && !param.enum.includes(value)) {
        errors.push(`${param.name} must be one of: ${param.enum.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
```

---

## Data Models

### Core Entities

```typescript
// MarketMakingOrder - User's market making order
interface MarketMakingOrder {
  id: string;
  userId: string;
  marketMakingPairId: string;
  strategyDefinitionId: string;

  // Campaign link (NOT part of strategy!)
  campaignId?: string;

  exchange: string;
  account: string;  // NEW: supports multiple API keys per exchange
  pair: string;

  // NEW: Immutable strategy snapshot for reproducibility
  // Captured at order creation time - never changes for this order
  strategySnapshot: {
    strategyScriptId: string;      // FK to StrategyScript
    strategyScriptHash: string;    // Hash for verification
    resolvedConfig: string;        // JSON snapshot of full RuntimeConfig
    createdAt: Date;               // When snapshot was taken
  };

  state: 'payment_pending' | 'payment_complete' | 'campaign_joined'
       | 'running' | 'stopped' | 'failed';

  startTime?: Date;
  endTime?: Date;

  createdAt: Date;
  updatedAt: Date;
}

// OrderExecutionBinding - Binds order to executor
interface OrderExecutionBinding {
  id: string;
  orderId: string;
  executorKey: string;  // "BINANCE:main:BTC-USDT" (includes account)
  sessionKey: string;   // Unique session identifier
  boundAt: Date;
  unboundAt?: Date;
}

// OrderDailySummary - ONE record per order per day
// Written ONLY when order stops or during daily reward processing
interface OrderDailySummary {
  id: string;
  orderId: string;
  date: string;                    // "YYYY-MM-DD"

  // Trade activity (aggregated for the day)
  makerVolume: string;
  takerBuyVolume: string;
  takerSellVolume: string;
  totalScore: string;
  tradeCount: number;

  // Reward attribution (filled after reward calculation)
  attributedReward?: string;

  createdAt: Date;
  updatedAt: Date;
}

// UserStrategyConfig - User's strategy config overrides
interface UserStrategyConfig {
  id: string;
  userId: string;
  strategyDefinitionKey: string;
  configOverrides: Record<string, any>;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Campaign - HuFi campaign
interface Campaign {
  id: string;

  // Campaign details
  exchange: string;
  pair: string;
  name: string;
  description: string;

  // Campaign timing
  startDate: Date;
  endDate: Date;

  // Reward details
  totalFund: string;              // BigNumber as string
  durationDays: number;
  dailyTarget: string;             // BigNumber as string

  // Campaign state
  state: 'pending' | 'active' | 'completed' | 'failed';

  createdAt: Date;
  updatedAt: Date;
}
```

---

## API Endpoints

### User-Facing Endpoints

```typescript
// Get available strategies
GET /user-orders/market-making/strategies
Response: {
  strategies: Array<{
    key: string;
    name: string;
    description: string;
    configSchema: JSONSchema;
    defaultConfig: Record<string, any>;
  }>;
}

// Create order intent (before sending Mixin transfer)
POST /user-orders/market-making/intent
Body: {
  marketMakingPairId: string;
  strategyDefinitionId: string;
  expiresAt: string; // ISO datetime
}
Response: {
  orderId: string;
  memo: string; // Encoded memo for Mixin transfer
}

// Get order details
GET /user-orders/market-making/orders/:orderId
Response: {
  order: MarketMakingOrder;
  currentPerformance: { ... };
}

// Get order revenue & history (same data source)
GET /user-orders/market-making/orders/:orderId/revenue
Response: OrderRevenueResponse;

// List user's orders
GET /user-orders/market-making/orders
Query: { state?: string; limit?: number; offset?: number }
Response: {
  orders: MarketMakingOrder[];
  total: number;
}

// Stop order
POST /user-orders/market-making/orders/:orderId/stop
Response: { success: boolean; }
```

### Admin Endpoints

```typescript
// Strategy Definition CRUD
GET /admin/strategy/definitions
POST /admin/strategy/definitions
PUT /admin/strategy/definitions/:id
DELETE /admin/strategy/definitions/:id
PATCH /admin/strategy/definitions/:id/publish
PATCH /admin/strategy/definitions/:id/enable
PATCH /admin/strategy/definitions/:id/disable

// Export strategy definition as YAML
GET /admin/strategy/definitions/:key/export
Response: YAML file download
Headers: Content-Disposition: attachment; filename="{key}.yaml"

// Import strategy definition from YAML
POST /admin/strategy/definitions/import
Body: multipart/form-data (YAML file)
Response: Created strategy definition

// User Strategy Config Management
GET /admin/users/:userId/strategy-configs
POST /admin/users/:userId/strategy-configs
PUT /admin/users/:userId/strategy-configs/:configId
DELETE /admin/users/:userId/strategy-configs/:configId

// Campaign Management
GET /admin/campaigns
POST /admin/campaigns/:campaignId/join
GET /admin/campaigns/:campaignId/participants
POST /admin/campaigns/:campaignId/process-rewards
```

---

## File Structure

```
server/src/
├── modules/
│   ├── market-making/
│   │   ├── orchestration/          # Pooled executor orchestration
│   │   │   ├── executor-registry.service.ts
│   │   │   ├── exchange-pair-executor.service.ts
│   │   │   └── strategy-session.service.ts
│   │   │
│   │   ├── scripts/                # Script loading & validation
│   │   │   ├── script-loader.service.ts
│   │   │   ├── script-registry.service.ts
│   │   │   └── config-schema-validator.service.ts
│   │   │
│   │   ├── campaigns/              # Campaign tracking & rewards
│   │   │   ├── in-memory-trade-aggregator.service.ts
│   │   │   ├── campaign-reward-accounting.service.ts
│   │   │   └── campaign-reward-distributor.service.ts
│   │   │
│   │   ├── strategy/
│   │   │   ├── execution/          # Intent pipeline
│   │   │   │   ├── strategy-intent-store.service.ts
│   │   │   │   ├── strategy-intent-worker.service.ts
│   │   │   │   └── strategy-intent-execution.service.ts
│   │   │   │
│   │   │   ├── intent/             # Orchestrator
│   │   │   │   └── executor-orchestrator.service.ts
│   │   │   │
│   │   │   └── config/             # Config resolution
│   │   │       └── strategy-config-resolver.service.ts
│   │   │
│   │   ├── trackers/               # Market data
│   │   │   ├── order-book-tracker.service.ts
│   │   │   └── private-stream-tracker.service.ts
│   │   │
│   │   ├── execution/              # Exchange connector
│   │   │   └── exchange-connector-adapter.service.ts
│   │   │
│   │   ├── ledger/                 # Balance ledger
│   │   │   └── balance-ledger.service.ts
│   │   │
│   │   ├── user-orders/            # Order processing
│   │   │   ├── user-orders.service.ts
│   │   │   └── market-making.processor.ts
│   │   │
│   │   └── tick/                   # Global tick
│   │       └── clock-tick-coordinator.service.ts
│   │
│   ├── campaign/                   # HuFi integration
│   │   └── campaign.service.ts
│   │
│   ├── mixin/                      # Mixin integration
│   │   ├── snapshots/
│   │   │   └── snapshots.service.ts
│   │   └── transaction/
│   │       └── transaction.service.ts
│   │
│   └── admin/                      # Admin endpoints
│       └── strategy/
│           └── adminStrategy.service.ts
│
├── strategies/                     # Strategy templates (seed files only)
│   ├── schemas/                    # Config schema templates
│   │   ├── pure-market-making.toml
│   │   ├── arbitrage.toml
│   │   └── volume.toml
│   │
│   └── scripts/                    # Script templates (seeded to DB)
│       ├── pure-market-making.ts
│       ├── arbitrage.ts
│       ├── volume.ts
│       └── types.ts                # Shared type definitions
│
├── seeds/
│   └── strategies/                 # Server start seeder
│       └── strategy-seeder.ts      # Loads templates to DB
│
└── common/
    └── entities/
        ├── market-making/
        │   ├── market-making-order.entity.ts
        │   ├── strategy-definition.entity.ts
        │   ├── strategy-script.entity.ts       # NEW: DB-based scripts
        │   ├── strategy-config-schema.entity.ts # NEW: Config schema
        │   ├── user-strategy-config.entity.ts
        │   └── order-daily-summary.entity.ts
        │
        └── ledger/
            ├── ledger-entry.entity.ts
            └── balance-read-model.entity.ts
```

---

## Migration Path

### Phase 1: Add New Components (Zero Risk)

**Objective**: Implement new components without touching existing code.

1. Create `StrategyScriptLoader` service
2. Create `ExecutorRegistry` service
3. Create `ExchangePairExecutor` class
4. Create `StrategySession` class
5. Create `InMemoryTradeAggregator` service
6. Create `CampaignRewardAccounting` service
7. Create `CampaignRewardDistributor` service

**Testing**:
- Unit tests for each new component
- Integration tests for campaign flow
- Load tests for trade recording

### Phase 2: Modify Existing Services (Medium Risk)

**Objective**: Integrate new components with existing services.

1. Update `StrategyService` to use `ExchangePairExecutor`
2. Update `StrategyConfigResolver` for `UserStrategyConfig`
3. Update admin strategy endpoints for script management
4. Update `start_mm` queue processor

**Testing**:
- Regression tests for existing functionality
- End-to-end tests for new pooled execution
- Performance tests for hot path latency

### Phase 3: Data Migration (Low Risk)

**Objective**: Migrate existing data to new model.

1. Add migration for `UserStrategyConfig` table
2. Add migration for `OrderDailySummary` table
3. Add migration for `OrderExecutionBinding` table
4. Backfill existing orders with execution bindings

**Testing**:
- Migration rollback tests
- Data integrity checks
- Performance tests for backfilled orders

### Phase 4: Gradual Rollout (Controlled Risk)

**Objective**: Roll out new architecture gradually.

1. Feature flag for pooled execution
2. Test with small subset of users
3. Monitor performance metrics
4. Expand to all users
5. Deprecate old execution model

**Testing**:
- A/B testing old vs new architecture
- Performance monitoring
- Error rate tracking
- User feedback collection

---

## Configuration

### Environment Variables

```bash
# Global tick interval (applies to all strategies)
STRATEGY_TICK_SIZE_MS=1000

# Intent execution driver
STRATEGY_INTENT_EXECUTION_DRIVER=worker  # or 'sync'

# Strategy execution
STRATEGY_RUN=true
STRATEGY_EXECUTE_INTENTS=true

# Exchange rate limiting
STRATEGY_EXCHANGE_MIN_REQUEST_INTERVAL_MS=200

# Mixin snapshots
STRATEGY_MIXIN_SNAPSHOTS_RUN=true

# Campaign tracking (Redis-based aggregation)
CAMPAIGN_TIMEZONE=UTC                           # Default UTC, can be overridden by admin
CAMPAIGN_REWARD_CRON="0 0 * * *"               # Daily at midnight (default UTC)
CAMPAIGN_REDIS_TTL=259200                      # 72 hours in seconds

# Trade recording (Redis)
REDIS_TRADE_BUFFER_TTL=72                      # 72 hours
```

---

## Monitoring & Observability

### Key Metrics

**Execution Metrics**:
- Tick duration (p50, p95, p99)
- Orders placed per second
- Fill rate percentage
- Intent processing latency
- Exchange API latency

**Campaign Metrics**:
- Daily trading volume per campaign
- Daily score per user/order
- Reward distribution accuracy
- Trade recording queue depth
- Background processing lag

**Business Metrics**:
- Active orders per exchange-pair
- Total value locked (TVL)
- Daily rewards distributed
- User retention rate
- Strategy performance comparison

### Health Checks

```typescript
// Executor health
GET /health/executors
Response: {
  executors: Array<{
    exchange: string;
    pair: string;
    sessionCount: number;
    lastTickTime: string;
    isHealthy: boolean;
  }>;
}

// Campaign tracking health
GET /health/campaign-tracking
Response: {
  queueDepth: number;
  processingLag: number; // seconds
  lastProcessedAt: string;
  isHealthy: boolean;
}
```

---

## Security Considerations

1. **Script Validation**: All scripts must be validated before loading
2. **Config Sanitization**: User config overrides must be validated against schema
3. **Idempotency**: All balance mutations use idempotency keys
4. **Rate Limiting**: Exchange API calls are rate-limited per exchange
5. **Balance Locking**: Funds are locked before market making begins
6. **Refund Safety**: Invalid snapshots are refunded automatically

---

## Troubleshooting

### Common Issues

**Issue**: Orders not being placed
- **Check**: Is executor registered for exchange-pair?
- **Check**: Is session bound to executor?
- **Check**: Is strategy script loaded successfully?
- **Check**: Are market data trackers healthy?

**Issue**: Campaign rewards not calculated
- **Check**: Is Redis healthy? (trades stored in Redis)
- **Check**: Is daily cron running?
- **Check**: Are trades being recorded with correct type (MAKER/TAKER)?
- **Check**: Did orders stop before midnight? (may need flush on stop)

**Issue**: Redis is down
- **Check**: Is Redis connection healthy?
- **Check**: Server should fail on startup if Redis unavailable - check process logs

**Issue**: Data lost after Redis restart
- **Check**: Is AOF persistence enabled?
- **Check**: Run reconciliation to recover from exchange API

**Issue**: Trade shows wrong MAKER/TAKER type
- **Check**: Is PrivateStreamTracker capturing executionType from exchange?
- **Check**: Exchange API returns 'maker' or 'taker' correctly

**Issue**: High tick latency
- **Check**: Number of active sessions per executor
- **Check**: Market data provider latency
- **Check**: Intent execution driver (should be 'worker')
- **Check**: Redis latency (if Redis-backed)

---

## Glossary

| Term | Definition |
|------|------------|
| **Executor** | Pooled execution context for an exchange-trading-pair |
| **Session** | Isolated state for a single user's order |
| **Strategy Script** | TypeScript file defining execution logic |
| **Config Schema** | TOML/JSON file defining strategy parameters |
| **Intent** | Action to be executed on exchange |
| **Orchestrator** | Converts actions to intents and persists them |
| **Worker** | Async background processor for intents |
| **Campaign** | HuFi market making incentive program |
| **Score** | Weighted trading volume for reward calculation |
| **MAKER** | Limit order that adds liquidity (weight: 1.0) |
| **TAKER** | Market order that removes liquidity (weight: 0.42/0.1) |
| **InMemoryTradeAggregator** | Redis-based real-time trade aggregation (no DB writes on fill) |
| **Flush** | Writing Redis data to SQLite when order stops |
| **Reconciliation** | Fixing trade data by querying exchange API |
| **OrderDailySummary** | One SQLite record per order per day (replaces per-fill records) |
| **PrivateStreamTracker** | Existing service that tracks fills from exchange |

---

## References

- [Hummingbot Documentation](https://docs.hummingbot.io/)
- [HuFi Campaign Specification](https://docs.hu.finance/)
- [Market Making Flow](../execution/flow/MARKET_MAKING_FLOW.md)
- [Current Server Architecture](./2026-02-09-current-server-architecture.md)

---

## Summary

### Key Design Decisions:

1. **Two-Part Strategy Definition**: Config Schema (DB) + Execution Script (DB)
2. **Pooled Execution**: One executor per exchange-account-pair (supports multiple API keys)
3. **Multi-User Support**: UserStrategyConfig for pro users to override defaults
4. **Campaign-Agnostic**: Campaigns linked at exchange-pair level, not strategy
5. **Redis-Based Trade Aggregation**: No per-fill DB writes, uses HINCRBY
6. **Redis Required**: No fallback - fail fast on startup if Redis unavailable
7. **Balance Reservation**: Reuses existing BalanceLedgerService.lockFunds()
8. **Order Reproducibility**: strategySnapshot captures script/config at order creation
9. **DB-Based Scripts**: Scripts stored in DB (source of truth), seeded on server start

### File Naming Conventions:

- **Config schemas**: `{key}.toml` or `{key}.json` (seeded to DB)
- **Scripts**: `{key}.ts` (seeded to DB)
- **Hummingbot imports**: Preserve original YAML in DB, convert to our format

### Database Storage:

- **StrategyScript**: Script content in DB with hash verification
- **StrategyConfigSchema**: Config schema in DB
- **MarketMakingOrder.strategySnapshot**: Immutable snapshot for reproducibility
- **UserStrategyConfig**: user overrides (not full configs)
- **OrderDailySummary**: daily trading summaries (not per-fill records)

This architecture provides a clean separation between configuration, execution logic, and multi-user customization while maintaining logical compatibility with Hummingbot.

---

## Changelog

- **2026-03-07** (continued): Addressed critical architecture issues
  - **P1**: Added account parameter to executor key (exchange:account:pair)
    - Supports multiple API keys/subaccounts per exchange
    - ExecutorRegistry updated to include account
  - **P2**: Added strategySnapshot to MarketMakingOrder for reproducibility
    - Captures script ID, hash, and resolved config at order creation
    - Order always uses captured logic, not mutable definitions
  - **P3**: Added balance reservation using existing BalanceLedgerService
    - Reuses lockFunds()/unlockFunds() from BalanceLedgerService
    - Fails fast if insufficient balance before creating session
  - **P4**: Removed Redis fallback - fail fast on startup
    - Server exits if Redis unavailable
    - No silent data loss
  - **P5**: Changed from filesystem scripts to DB-based scripts
    - Scripts stored in StrategyScript table
    - Seeded from templates on server start
    - Publish new versions via DB update (not filesystem)

- **2026-03-07**: Merged strategy definition protocol into pooled executor architecture
  - Added comprehensive TOML/JSON config schema format with examples
  - Added detailed type definitions (RuntimeConfig, SessionState, etc.)
  - Added complete config resolution flow
  - Added campaign linkage at exchange-pair level
  - Added Hummingbot YAML import feature
  - Added validation rules implementation
  - Added enhanced ScriptLoader with chokidar hot reload

- **2026-03-06**: Added Redis-based trade aggregation (no per-fill DB writes)
  - Use Redis HINCRBY for real-time aggregation
  - Write OrderDailySummary to SQLite only on stop or daily cron
  - Added flush on order stop
  - Added reconciliation via exchange API
  - ~~Added Redis fallback when unavailable~~ (removed)
  - Added timezone configuration (UTC default, admin configurable)
  - Unified order history and campaign tracking (same data source)
