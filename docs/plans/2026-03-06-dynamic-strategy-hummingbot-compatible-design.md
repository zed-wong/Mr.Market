# Dynamic Strategy Definition - Hummingbot-Compatible Design

**Status:** Deprecated
**Superseded By:** `docs/plans/2026-03-06-pooled-executor-architecture.md`

> Historical design exploration only.
> This document proposes strategy-definition storage and config flows that do not match the current pooled executor architecture source of truth.

## Goal

- Strategy definitions fully compatible with Hummingbot strategy config format
- Default definitions in server seeders (not DB)
- User-created strategies have no default values
- Phase 1: Export only, Phase 2: Import support

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    StrategyDefinition                        │
│  (stores YAML/JSON - same format as hummingbot config)     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               StrategyConfigResolver                        │
│  - Resolves YAML/JSON → runtime config                     │
│  - Validates against config_schema                          │
│  - Applies defaults from seeder                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  StrategyRuleEngine                          │
│  - Parses controller config                                 │
│  - Evaluates signals                                        │
│  - Emits ExecutorAction[]                                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  ExecutorOrchestrator                        │
│  (existing - unchanged)                                     │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
server/src/database/seeder/
├── seed.ts                          # runs all seeds
├── defaultSeedValues.ts            # strategy definition seeds
├── strategy-yaml.loader.ts         # YAML file loader
└── data/
    └── strategies/
        ├── pure-market-making.yaml
        ├── arbitrage.yaml
        ├── volume.yaml
        └── time-indicator.yaml
```

## Hummingbot-Compatible YAML Format

### Pure Market Making

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

  # Spread configuration
  bid_spread: 0.001
  ask_spread: 0.001
  minimum_spread: -100

  # Order configuration
  order_amount: 0.001
  order_refresh_time: 60
  max_order_age: 1800
  order_refresh_tolerance_pct: 0

  # Multi-level orders
  order_levels: 1
  order_level_amount: 0
  order_level_spread: 0.01

  # Risk controls
  max_position: 1000
  price_ceiling: -1
  price_floor: -1

  # Features
  ping_pong_enabled: false
  hanging_orders_enabled: false
  hanging_orders_cancel_pct: 0.01

  # Inventory
  inventory_skew_enabled: false
  inventory_target_base_pct: 50
  inventory_range_multiplier: 1

  # Timing
  filled_order_delay: 60
```

### Arbitrage

```yaml
strategy: arbitrage

exchanges:
  - exchange: binance
    candles:
      - id: binance_data
        trading_pair: BTC-USDT
        interval: 1m
  - exchange: coinbase
    candles:
      - id: coinbase_data
        trading_pair: BTC-USDT
        interval: 1m

controller:
  candles: binance_data
  secondary_candles: coinbase_data

  # Profitability
  min_profitability: 0.001
  gas_adjustment_factor: 1.1

  # Order configuration
  order_amount: 0.001
  max_order_age: 300

  # Timing
  status_report_interval: 10
```

### Volume

```yaml
strategy: volume

exchanges:
  - exchange: binance
    candles:
      - id: market_data
        trading_pair: BTC-USDT

controller:
  candles: market_data
  execution_mode: amm_dex

  # Token configuration
  target_token: BTC
  base_token: USDT

  # Swap configuration
  swap_slippages:
    - 0.01
    - 0.02
    - 0.03
  swap_interval: 60

  # Cycle limits
  max_cycle_count: 1000
  max_swap_amount_per_cycle: 1000
  total_swap_amount_limit: 100000

  # Timing
  cycle_check_interval: 30
```

### Time Indicator

```yaml
strategy: time_indicator

exchanges:
  - exchange: binance
    candles:
      - id: market_data
        trading_pair: BTC-USDT
        interval: 1m

controller:
  candles: market_data

  # Indicators
  indicators:
    - type: ema
      fast_period: 20
      slow_period: 50
    - type: rsi
      period: 14
      overbought: 70
      oversold: 30

  # Signals
  buy_threshold: 0
  sell_threshold: 0

  # Execution
  order_type: limit
  order_amount: 0.001
  order_refresh_time: 60

  # Risk
  max_position: 1000
```

## Data Model

### StrategyDefinition Entity

```typescript
interface StrategyDefinition {
  id: string;
  key: string;                    // e.g., "pure_market_making"
  name: string;
  description?: string;
  controllerType: string;         // maps to RuleEngine class

  // Full config stored as JSON (parsed from YAML in seeder)
  configSchema: JSONSchema;        // validation rules
  defaultConfig: Record<string, any>;  // defaults from seeder (empty for user)

  // Rules (Phase 2 - for custom strategies)
  rules?: StrategyRule[];

  enabled: boolean;
  visibility: 'system' | 'public'; // system = seeder, public = user created
  currentVersion: string;

  createdAt: Date;
  updatedAt: Date;
}
```

### StrategyRule Interface (Phase 2)

```typescript
interface StrategyRule {
  type: 'signal' | 'execution' | 'risk' | 'timing';

  // signal
  condition?: string;
  indicator?: string;
  thresholds?: { buy?: number; sell?: number; };

  // execution
  order_type?: 'limit' | 'market';
  order_refresh_time?: number;

  // risk
  max_slippage?: number;
  max_position?: string;

  // timing
  cadence?: number;
}
```

## Implementation Phases

### Phase 1: Export Support

| Task | Description |
|------|-------------|
| 1.1 | Create YAML seeder files for 4 strategies |
| 1.2 | Update seeders to load YAML and store in DB |
| 1.3 | Add export endpoint (YAML download) |
| 1.4 | Update ConfigResolver to merge defaults |

### Phase 2: Import Support (Future)

| Task | Description |
|------|-------------|
| 2.1 | Add import endpoint (YAML upload) |
| 2.2 | Add YAML → JSON migration logic |
| 2.3 | Support custom strategy templates |
| 2.4 | Rule builder UI |

## API Endpoints

### Export Strategy Definition

```typescript
// GET /admin/strategy/definitions/:id/export
// Returns: YAML file
// Headers: Content-Disposition: attachment; filename="{id}.yaml"
```

### Import Strategy Definition (Phase 2)

```typescript
// POST /admin/strategy/definitions/import
// Body: multipart/form-data (YAML file)
// Returns: Created strategy definition
```

## Backward Compatibility

- Existing hardcoded controllers remain functional
- New seeder definitions take precedence
- User-created strategies without defaults (migration path: copy from seeder template)

## Seeder Loading

```typescript
// database/seeder/strategy-yaml.loader.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'yaml';

const STRATEGY_YAML_DIR = join(__dirname, 'data/strategies');

export function loadStrategyYaml(filename: string) {
  const filePath = join(STRATEGY_YAML_DIR, filename);
  const content = readFileSync(filePath, 'utf-8');
  return yaml.parse(content);
}

// database/seeder/defaultSeedValues.ts
export const defaultStrategyDefinitions: Partial<StrategyDefinition>[] = [
  {
    key: 'pure_market_making',
    name: 'Pure Market Making',
    description: 'Place buy and sell orders on both sides of the order book',
    controllerType: 'pure_market_making',
    configSchema: loadStrategyYaml('pure-market-making.yaml'),
    defaultConfig: {},  // derived from YAML for user reference
    enabled: true,
    visibility: 'system',
    createdBy: 'seed',
  },
  // ... other strategies (arbitrage, volume, time_indicator)
];
```

## Verification

- Server seeds all 4 strategy definitions on startup
- Export returns valid YAML with all fields
- ConfigResolver correctly merges defaults
- Existing strategy instances continue to work

## Related Files

| File | Purpose |
|------|---------|
| `server/src/common/entities/market-making/strategy-definition.entity.ts` | DB entity |
| `server/src/modules/market-making/strategy/dex/strategy-config-resolver.service.ts` | Config merge |
| `server/src/modules/admin/strategy/adminStrategy.service.ts` | Admin CRUD |
| `server/src/database/seeder/strategy-yaml.loader.ts` | YAML file loader |
| `server/src/database/seeder/defaultSeedValues.ts` | Strategy definition seeds |
| `server/src/modules/admin/admin.controller.ts` | API endpoints |

## Changelog

- 2026-03-06: Initial design - Hummingbot-compatible strategy definitions
