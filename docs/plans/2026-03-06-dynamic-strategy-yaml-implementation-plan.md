# Dynamic Strategy - Hummingbot-Compatible YAML Implementation Plan

> **For Claude:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Hummingbot-compatible YAML strategy definition files to server seeders, with export support.

**Architecture:** Store strategy definitions as YAML files in seeder, load and parse at seed time, store in DB. Add export endpoint to download as YAML.

**Tech Stack:** TypeScript, yaml (npm package), NestJS, SQLite

---

## Task 1: Install yaml package

**Files:**
- Modify: `server/package.json`

**Step 1: Add yaml dependency**

```bash
cd server && bun add yaml
```

**Step 2: Run install**

```bash
bun install
```

**Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "feat(strategy): add yaml package for strategy definitions"
```

---

## Task 2: Create strategy YAML data files

**Files:**
- Create: `server/src/database/seeder/data/strategies/pure-market-making.yaml`
- Create: `server/src/database/seeder/data/strategies/arbitrage.yaml`
- Create: `server/src/database/seeder/data/strategies/volume.yaml`
- Create: `server/src/database/seeder/data/strategies/time-indicator.yaml`

**Step 1: Create directory**

```bash
mkdir -p server/src/database/seeder/data/strategies
```

**Step 2: Create pure-market-making.yaml**

```yaml
# Pure Market Making - Hummingbot compatible
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

**Step 3: Create arbitrage.yaml**

```yaml
# Arbitrage - Hummingbot compatible
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

**Step 4: Create volume.yaml**

```yaml
# Volume Strategy - Hummingbot compatible
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

**Step 5: Create time-indicator.yaml**

```yaml
# Time Indicator Strategy - Hummingbot compatible
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

**Step 6: Commit**

```bash
git add server/src/database/seeder/data/strategies/
git commit -m "feat(strategy): add YAML strategy definition files"
```

---

## Task 3: Create YAML loader utility

**Files:**
- Create: `server/src/database/seeder/strategy-yaml.loader.ts`

**Step 1: Create the utility**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

const STRATEGY_YAML_DIR = path.join(__dirname, 'data/strategies');

export type StrategyYamlConfig = {
  strategy: string;
  exchanges: Array<{
    exchange: string;
    candles?: Array<{
      id: string;
      trading_pair: string;
      interval?: string;
    }>;
  }>;
  controller: Record<string, unknown>;
};

export function loadStrategyYaml(
  filename: string,
): StrategyYamlConfig {
  const filePath = path.join(STRATEGY_YAML_DIR, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.parse(content) as StrategyYamlConfig;
}

export function getAllStrategyYamlFiles(): string[] {
  return fs.readdirSync(STRATEGY_YAML_DIR).filter((f) => f.endsWith('.yaml'));
}
```

**Step 2: Commit**

```bash
git add server/src/database/seeder/strategy-yaml.loader.ts
git commit -m "feat(strategy): add YAML loader utility"
```

---

## Task 4: Update seed.ts to use YAML files

**Files:**
- Modify: `server/src/database/seeder/defaultSeedValues.ts:355-474`

**Step 1: Update defaultSeedValues.ts to use YAML loader**

First, add import at top:

```typescript
import { loadStrategyYaml } from './strategy-yaml.loader';
```

Then replace the defaultStrategyDefinitions array with:

```typescript
export const defaultStrategyDefinitions: Partial<StrategyDefinition>[] = [
  {
    key: 'pure_market_making',
    name: 'Pure Market Making',
    description: 'Place buy and sell orders on both sides of the order book',
    controllerType: 'pure_market_making',
    configSchema: loadStrategyYaml('pure-market-making.yaml'),
    defaultConfig: {},  // User-created strategies have no defaults
    enabled: true,
    visibility: 'system',
    createdBy: 'seed',
  },
  {
    key: 'arbitrage',
    name: 'Arbitrage',
    description: 'Cross-exchange arbitrage between two exchanges',
    controllerType: 'arbitrage',
    configSchema: loadStrategyYaml('arbitrage.yaml'),
    defaultConfig: {},
    enabled: true,
    visibility: 'system',
    createdBy: 'seed',
  },
  {
    key: 'volume',
    name: 'Volume',
    description: 'Generate volume with controlled swaps',
    controllerType: 'volume',
    configSchema: loadStrategyYaml('volume.yaml'),
    defaultConfig: {},
    enabled: true,
    visibility: 'system',
    createdBy: 'seed',
  },
  {
    key: 'time_indicator',
    name: 'Time Indicator',
    description: 'Trade based on EMA/RSI indicators',
    controllerType: 'time_indicator',
    configSchema: loadStrategyYaml('time-indicator.yaml'),
    defaultConfig: {},
    enabled: true,
    visibility: 'system',
    createdBy: 'seed',
  },
];
```

**Step 2: Run seed to test**

```bash
cd server && bun run src/database/seeder/seed.ts
```

Expected: No errors, seeds 4 strategy definitions

**Step 3: Commit**

```bash
git add server/src/database/seeder/defaultSeedValues.ts
git commit -m "feat(strategy): load strategy definitions from YAML files"
```

---

## Task 5: Add export endpoint for strategies

**Files:**
- Modify: `server/src/modules/admin/strategy/adminStrategy.service.ts`
- Modify: `server/src/modules/admin/admin.controller.ts`

**Step 1: Add export method to adminStrategy.service.ts**

Add after existing methods:

```typescript
async exportStrategyDefinition(key: string): Promise<string> {
  const definition = await this.strategyDefinitionRepository.findOne({
    where: { key },
  });

  if (!definition) {
    throw new BadRequestException(`Strategy definition not found: ${key}`);
  }

  // Convert to YAML
  const yamlContent = yaml.stringify({
    strategy: definition.controllerType,
    // Add metadata
    name: definition.name,
    description: definition.description,
    // Add config
    ...(definition.configSchema as Record<string, unknown>),
  });

  return yamlContent;
}
```

**Step 2: Add endpoint to admin.controller.ts**

Find the admin controller and add:

```typescript
@Get('strategies/:key/export')
async exportStrategy(@Param('key') key: string) {
  const yaml = await this.adminStrategyService.exportStrategyDefinition(key);

  res.setHeader('Content-Type', 'text/yaml');
  res.setHeader('Content-Disposition', `attachment; filename="${key}.yaml"`);
  return res.send(yaml);
}
```

**Step 3: Test endpoint**

```bash
curl http://localhost:3000/admin/strategies/pure_market_making/export
```

Expected: Returns YAML file

**Step 4: Commit**

```bash
git add server/src/modules/admin/strategy/adminStrategy.service.ts server/src/modules/admin/admin.controller.ts
git commit -m "feat(strategy): add export endpoint for strategy definitions"
```

---

## Task 6: Add yaml import for admin service

**Files:**
- Modify: `server/src/modules/admin/strategy/adminStrategy.service.ts`

**Step 1: Add yaml import**

```typescript
import * as yaml from 'yaml';
```

**Step 2: Commit**

```bash
git add server/src/modules/admin/strategy/adminStrategy.service.ts
git commit -m "chore: add yaml import to admin strategy service"
```

---

## Task 7: Run tests and verify

**Step 1: Run server tests**

```bash
cd server && bun run test
```

Expected: All tests pass

**Step 2: Run lint**

```bash
cd server && bun run lint
```

Expected: No errors

**Step 3: Verify seed works**

```bash
cd server && bun run src/database/seeder/seed.ts
```

Expected: Seeds all 4 strategy definitions without error

**Step 4: Commit**

```bash
git add -A && git commit -m "test: verify strategy seed and tests pass"
```

---

## Task 8: Update CHANGELOG

**Files:**
- Modify: `docs/execution/CHANGELOG.md`

**Step 1: Add entry**

```markdown
- 2026-03-06: Add Hummingbot-compatible YAML strategy definitions in seeders
```

**Step 2: Commit**

```bash
git add docs/execution/CHANGELOG.md
git commit -m "docs: update changelog"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Install yaml package |
| 2 | Create 4 YAML strategy files |
| 3 | Create YAML loader utility |
| 4 | Update seed.ts to use YAML |
| 5 | Add export endpoint |
| 6 | Add yaml import |
| 7 | Run tests and verify |
| 8 | Update CHANGELOG |

---

## Verification Commands

```bash
# Run tests
cd server && bun run test

# Run lint
cd server && bun run lint

# Run seed
cd server && bun run src/database/seeder/seed.ts

# Test export endpoint
curl http://localhost:3000/admin/strategies/pure_market_making/export
```

---

## Related Files

| File | Purpose |
|------|---------|
| `server/src/database/seeder/seed.ts` | Seed runner |
| `server/src/database/seeder/defaultSeedValues.ts` | Seed data |
| `server/src/database/seeder/strategy-yaml.loader.ts` | YAML loader |
| `server/src/database/seeder/data/strategies/*.yaml` | Strategy YAML files |
| `server/src/modules/admin/strategy/adminStrategy.service.ts` | Admin service |
| `server/src/modules/admin/admin.controller.ts` | Admin controller |
