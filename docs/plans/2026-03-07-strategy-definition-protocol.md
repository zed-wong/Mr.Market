# Mr.Market Strategy Definition Protocol

**Version:** 1.0
**Date:** 2026-03-07
**Status:** Protocol Specification

---

## Overview

Mr.Market uses a **two-part strategy definition** model inspired by Hummingbot:

1. **Config Schema** (TOML/JSON) - Defines what parameters exist, their types, defaults, and validation rules
2. **Execution Script** (TypeScript) - Defines the trading logic and how decisions are made

**Key Design Principles:**
- **Logically compatible** with Hummingbot's controller/executor pattern
- **Multi-user support** - Pro users can override config per order
- **Campaign-agnostic** - Campaigns are linked at exchange-pair level, not strategy
- **TypeScript scripts** - Hot-reloadable execution logic

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Strategy Definition                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Config Schema (TOML/JSON)                               │  │
│  │  ├─ Metadata (name, version, description)                │  │
│  │  ├─ Parameters (configurable fields + defaults)          │  │
│  │  └─ Constraints (min/max, validation rules)               │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Execution Script (TypeScript)                             │  │
│  │  ├─ Implements IStrategyScript interface                │  │
│  │  ├─ validateConfig(config): boolean                       │  │
│  │  ├─ createSession(config): SessionState                   │  │
│  │  ├─ onTick(session, marketData): Action[]                │  │
│  │  ├─ onFill(session, fill): Action[]                       │  │
│  │  └─ onError(session, error): Action[]                     │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Config Resolution                            │
│                                                                  │
│  RuntimeConfig = defaultConfig + userConfigOverride           │
│                                                                  │
│  ├─ Admin defines defaultConfig (in config schema)         │
│  ├─ Pro user sets userConfigOverride (per order)           │
│  └─ Normal user uses defaults                               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Campaign Linkage                             │
│                                                                  │
│  Campaign  ←exchange-pair→  ExchangePairExecutor           │
│     ↓                                                          │
│  All orders on this pair automatically participate              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Config Schema (TOML/JSON)

### Schema Structure

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

### Parameter Definition Format

Each parameter defines:

| Field | Type | Required | Description |
|------|------|----------|-------------|
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

### Example: Pure Market Making

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

### Example: Arbitrage

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

### Example: Volume

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

### Alternative: JSON Format

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

## Part 2: Execution Script Interface

### IStrategyScript Interface

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

### Type Definitions

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

---

## Part 3: Config Resolution Flow

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

## Part 4: Campaign Integration (Separate from Strategy)

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

## Part 5: Importing Hummingbot Strategies

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

order_optimization_enabled: false
ask_order_optimization_depth: 1
bid_order_optimization_depth: 1

order_refresh_tolerance_pct: 0.0
order_optimization_depth: 1

inventory_skew_enabled: false
inventory_target_base_pct: 50

inventory_range_multiplier: 1

price_band_enabled: false
price_ceiling: -1
price_floor: -1

order_level_spread: 0.01
price_ceiling: -1
price_floor: -1

hanging_orders_enabled: false
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

## Part 6: File Structure

```
server/src/
├── strategies/
│   ├── schemas/                      # Config schema files
│   │   ├── pure-market-making.toml
│   │   ├── arbitrage.toml
│   │   └── volume.toml
│   │
│   └── scripts/                       # Execution scripts
│       ├── pure-market-making.ts
│       ├── arbitrage.ts
│       └── volume.ts
│
├── modules/
│   ├── market-making/
│   │   ├── orchestration/
│   │   │   ├── StrategyScriptLoader.service.ts
│   │   │   └── StrategyConfigResolver.service.ts
│   │   │
│   │   ├── campaigns/
│   │   │   ├── CampaignLinker.service.ts
│   │   │   └── CampaignService.service.ts (existing)
│   │   │
│   │   └── scripts/
│   │       ├── IStrategyScript.interface.ts
│       └── ...
│
└── common/
    └── entities/
        ├── market-making/
        │   ├── StrategyDefinition.entity.ts
        │   ├── UserStrategyConfig.entity.ts
        │   └── OrderDailySummary.entity.ts
        │
        └── campaign/
            └── Campaign.entity.ts
```

---

## Part 7: Database Entities

### StrategyDefinition Entity

```typescript
interface StrategyDefinition {
  id: string;
  key: string;                       // e.g., "pure_market_making"
  name: string;
  description?: string;

  // Schema reference
  configSchemaPath: string;         // e.g., "strategies/schemas/pure-market-making.toml"
  scriptPath: string;                // e.g., "strategies/scripts/pure-market-making.ts"

  // Metadata
  enabled: boolean;
  visibility: 'system' | 'public';
  currentVersion: string;
  importSource: 'custom' | 'hummingbot';

  createdAt: Date;
  updatedAt: Date;
}
```

### UserStrategyConfig Entity

```typescript
interface UserStrategyConfig {
  id: string;
  userId: string;
  strategyDefinitionKey: string;

  // User's config overrides for this strategy
  configOverrides: Record<string, any>;

  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Campaign Entity (for reference)

```typescript
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

### MarketMakingOrder Entity (has campaignId)

```typescript
interface MarketMakingOrder {
  id: string;
  userId: string;
  marketMakingPairId: string;
  strategyDefinitionId: string;

  // Campaign link (NOT part of strategy!)
  campaignId?: string;

  exchange: string;
  pair: string;

  state: 'payment_pending' | 'payment_complete' | 'running' | 'stopped' | 'failed';

  startTime?: Date;
  endTime?: Date;

  createdAt: Date;
  updatedAt: Date;
}
```

---

## Part 8: Validation Rules

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

## Part 9: Script Loading and Hot Reload

### Script Loader

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

  watchAndReload(scriptPath: string): void {
    const watcher = chokidar.watch(scriptPath);

    watcher.on('change', async () => {
      console.log(`Script changed: ${scriptPath}, reloading...`);

      try {
        await this.loadScript(scriptPath);
        console.log(`Successfully reloaded: ${scriptPath}`);
      } catch (error) {
        console.error(`Failed to reload script: ${error.message}`);
      }
    });
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
}
```

---

## Part 10: Example Implementation

### Pure Market Making Script

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

## Summary

### Key Design Decisions:

1. **Config Schema (TOML/JSON)**: Defines parameters, defaults, validation
2. **Execution Script (TypeScript)**: Implements IStrategyScript interface
3. **Separation of Concerns**: Config ≠ Script ≠ Campaign
4. **Multi-user Support**: UserStrategyConfig for pro users
5. **Hummingbot Import**: YAML import feature for compatibility
6. **Campaign Linkage**: Campaign at exchange-pair level, not strategy

### File Naming Conventions:

- **Config schemas**: `{key}.toml` or `{key}.json`
- **Scripts**: `{key}.ts`
- **Hummingbot imports**: Preserve original YAML in DB, convert to our format

### Database Storage:

- **StrategyDefinition**: schema + script paths (references files on disk)
- **UserStrategyConfig**: user overrides (not full configs)
- **OrderDailySummary**: daily trading summaries (not per-fill records)

This protocol provides a clean separation between configuration, execution logic, and multi-user customization while maintaining logical compatibility with Hummingbot.
