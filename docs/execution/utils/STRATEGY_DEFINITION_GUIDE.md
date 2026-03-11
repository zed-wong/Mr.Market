# Strategy Definition Guide

This document describes the dynamic strategy definition architecture in Mr.Market.

## Overview

Mr.Market uses a **dynamic configuration, static logic** approach for strategy management:

- **Dynamic**: Strategy settings (config schema, defaults) are stored in the database
- **Static**: Strategy logic (controllers) is built into the server code

This allows admins to manage strategy configurations without code changes, while keeping execution safe and predictable.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin Management                          │
│  Create/Edit StrategyDefinition via Admin API               │
│  - Define configSchema (JSON Schema)                        │
│  - Set defaultConfig                                         │
│  - Choose controllerType (maps to built-in controller)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    StrategyDefinition Entity                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ id: UUID                                                │ │
│  │ key: 'pure_market_making'                               │ │
│  │ name: 'Pure Market Making'                              │ │
│  │ controllerType: 'pureMarketMaking'                      │ │
│  │ configSchema: { type: 'object', properties: {...} }     │ │
│  │ defaultConfig: { bidSpread: 0.001, ... }                │ │
│  │ currentVersion: '1.0.0'                                 │ │
│  │ enabled: true                                           │ │
│  │ visibility: 'system' | 'instance'                       │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 User Order Creation                          │
│  POST /user-orders/market-making/intent                     │
│  {                                                           │
│    marketMakingPairId: '...',                                │
│    strategyDefinitionId: '...',  // Select definition        │
│    configOverrides: { ... }      // Optional overrides       │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Config Resolution (at payment completion)       │
│  StrategyConfigResolverService.resolveForOrderSnapshot()    │
│  1. Load StrategyDefinition                                 │
│  2. Merge: defaultConfig + configOverrides                  │
│  3. Validate against configSchema                           │
│  4. Return snapshot payload                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Order Snapshot (pinned at creation)             │
│  MarketMakingOrder.strategySnapshot = {                     │
│    definitionVersion: '1.0.0',                              │
│    controllerType: 'pureMarketMaking',                      │
│    resolvedConfig: { bidSpread: 0.002, ... }                │
│  }                                                           │
│  ⚠️ Runtime NEVER re-resolves config                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Runtime Execution                               │
│  1. start_mm reads strategySnapshot                         │
│  2. controllerType → StrategyType mapping                   │
│  3. Get/create ExchangePairExecutor                         │
│  4. Add order session with resolvedConfig                   │
│  5. Controller uses config for tick decisions               │
└─────────────────────────────────────────────────────────────┘
```

## Database Entity

```typescript
// server/src/common/entities/market-making/strategy-definition.entity.ts
@Entity('strategy_definitions')
export class StrategyDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;                    // e.g., 'pure_market_making'

  @Column()
  name: string;                   // e.g., 'Pure Market Making'

  @Column({ nullable: true })
  description?: string;

  @Column()
  controllerType: string;         // Maps to built-in controller

  @Column('simple-json')
  configSchema: Record<string, unknown>;   // JSON Schema

  @Column('simple-json')
  defaultConfig: Record<string, unknown>;  // Default values

  @Column({ default: true })
  enabled: boolean;

  @Column({ default: 'system' })
  visibility: 'system' | 'instance';

  @Column({ default: '1.0.0' })
  currentVersion: string;

  @Column({ nullable: true })
  createdBy?: string;
}
```

## JSON Schema Format

Config schema follows standard JSON Schema specification:

```json
{
  "type": "object",
  "required": ["bidSpread", "askSpread", "orderAmount"],
  "additionalProperties": false,
  "properties": {
    "bidSpread": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.001,
      "title": "Bid Spread",
      "description": "Spread from mid price for bid orders"
    },
    "askSpread": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.001,
      "title": "Ask Spread"
    },
    "orderAmount": {
      "type": "number",
      "minimum": 0.0001,
      "default": 0.001,
      "title": "Order Amount"
    },
    "orderRefreshTime": {
      "type": "number",
      "minimum": 1000,
      "default": 15000,
      "title": "Order Refresh Time (ms)"
    }
  }
}
```

## Built-in Controller Types

| controllerType | Controller Class | Description |
|----------------|-----------------|-------------|
| `pureMarketMaking` | `PureMarketMakingStrategyController` | Classic market making with bid/ask spread |
| `arbitrage` | `ArbitrageStrategyController` | Cross-exchange arbitrage |
| `volume` | `VolumeStrategyController` | Volume generation |
| `timeIndicator` | `TimeIndicatorStrategyController` | EMA/RSI based trading |

Controller registry location: `server/src/modules/market-making/strategy/controllers/strategy-controller.registry.ts`

## Config Resolution Flow

```typescript
// server/src/modules/market-making/strategy/dex/strategy-config-resolver.service.ts

async resolveForOrderSnapshot(
  definitionId: string,
  overrides?: Record<string, unknown>,
): Promise<{
  definitionVersion: string;
  controllerType: string;
  resolvedConfig: Record<string, unknown>;
}> {
  // 1. Load definition from DB
  const definition = await this.strategyDefinitionRepository.findOne({
    where: { id: definitionId },
  });

  if (!definition) {
    throw new BadRequestException(`Strategy definition ${definitionId} not found`);
  }

  // 2. Merge defaults + overrides
  const resolvedConfig = this.mergeConfig(
    definition.defaultConfig,
    overrides || {},
  );

  // 3. Validate against schema
  this.validateConfigAgainstSchema(resolvedConfig, definition.configSchema);

  // 4. Return snapshot payload
  return {
    definitionVersion: definition.currentVersion,
    controllerType: definition.controllerType,
    resolvedConfig,
  };
}
```

## Order Snapshot Structure

```typescript
// server/src/common/entities/orders/user-orders.entity.ts

type MarketMakingOrderStrategySnapshot = {
  definitionVersion: string;       // For audit/reference only
  controllerType: string;          // Maps to StrategyType
  resolvedConfig: Record<string, unknown>;  // Actual config used
};

@Entity()
class MarketMakingOrder {
  // ...

  @Column('simple-json', { nullable: true })
  strategySnapshot?: MarketMakingOrderStrategySnapshot;
}
```

## Seeding Default Definitions

Default strategy definitions are seeded from YAML files:

```bash
bun run migration:seed
```

YAML files location: `server/src/database/seeder/data/strategies/`

- `pure-market-making.yaml`
- `arbitrage.yaml`
- `volume.yaml`
- `time-indicator.yaml`

Seed logic: `server/src/database/seeder/seed.ts`

```typescript
export async function seedStrategyDefinitions(
  repository: Repository<StrategyDefinition>,
  versionRepository: Repository<StrategyDefinitionVersion>,
) {
  for (const definition of defaultStrategyDefinitions) {
    // Check if already exists by key
    let saved = await repository.findOneBy({ key: definition.key });

    if (!saved) {
      // Create new definition
      saved = await repository.save(
        repository.create({
          key: definition.key,
          name: definition.name,
          controllerType: definition.controllerType,
          configSchema: definition.configSchema,
          defaultConfig: definition.defaultConfig,
          currentVersion: '1.0.0',
          enabled: true,
          visibility: 'system',
        }),
      );
    }

    // Also create initial version snapshot
    // ...
  }
}
```

## API Endpoints

### Admin Endpoints

```typescript
// List all definitions
GET /admin/strategy/definitions

// Get single definition
GET /admin/strategy/definitions/:id

// Create definition
POST /admin/strategy/definitions
{
  key: 'my_custom_strategy',
  name: 'My Custom Strategy',
  controllerType: 'pureMarketMaking',
  configSchema: { ... },
  defaultConfig: { ... }
}

// Update definition
PUT /admin/strategy/definitions/:id

// Enable/disable
PATCH /admin/strategy/definitions/:id/enable
PATCH /admin/strategy/definitions/:id/disable

// Export as YAML
GET /admin/strategy/definitions/:id/export
```

### User Endpoints

```typescript
// List enabled strategies (for user selection)
GET /user-orders/market-making/strategies

// Get single strategy details
GET /user-orders/market-making/strategies/:id

// Create intent with strategy selection
POST /user-orders/market-making/intent
{
  marketMakingPairId: string,
  strategyDefinitionId: string,
  configOverrides?: Record<string, unknown>
}
```

## Config Override Example

User creates order with custom spread:

```typescript
// Request
POST /user-orders/market-making/intent
{
  "marketMakingPairId": "pair-uuid",
  "strategyDefinitionId": "pure-mm-uuid",
  "configOverrides": {
    "bidSpread": 0.002,
    "askSpread": 0.002,
    "orderAmount": 0.01
  }
}

// Resolution (in payment complete handler)
// definition.defaultConfig: { bidSpread: 0.001, askSpread: 0.001, orderAmount: 0.001, orderRefreshTime: 15000 }
// + configOverrides: { bidSpread: 0.002, askSpread: 0.002, orderAmount: 0.01 }
// = resolvedConfig: { bidSpread: 0.002, askSpread: 0.002, orderAmount: 0.01, orderRefreshTime: 15000 }

// Stored snapshot
order.strategySnapshot = {
  definitionVersion: '1.0.0',
  controllerType: 'pureMarketMaking',
  resolvedConfig: {
    bidSpread: 0.002,
    askSpread: 0.002,
    orderAmount: 0.01,
    orderRefreshTime: 15000
  }
}
```

## Key Design Decisions

### 1. Snapshot Pinning

Orders store resolved config at creation time. Runtime never re-resolves.

**Why?**
- Definition changes don't affect running orders
- Reproducible behavior for auditing
- No race conditions between definition updates and order execution

### 2. JSON Schema Only

Only JSON Schema is supported for config validation.

**Why?**
- Simple and widely understood
- No runtime compilation needed
- Easy to validate in both frontend and backend

### 3. Static Controller Logic

Controller code is built into the server, not stored in DB.

**Why?**
- Security: No arbitrary code execution
- Reliability: Tested code, not ad-hoc scripts
- Simplicity: No sandboxing or compilation needed

### 4. controllerType Mapping

`controllerType` string maps to registered controller class.

```typescript
// StrategyRuntimeDispatcherService normalizes controller aliases and maps them
// to the runtime string union used by StrategyService.
toStrategyType(controllerType: string): StrategyType {
  const normalized = normalizeControllerType(controllerType);

  if (normalized === 'pureMarketMaking') return 'pureMarketMaking';
  if (normalized === 'arbitrage') return 'arbitrage';
  if (normalized === 'volume') return 'volume';
  if (normalized === 'timeIndicator') return 'timeIndicator';

  throw new Error(`Unsupported controllerType: ${controllerType}`);
}
```

## Migration and Backfill

### For Existing Orders Without Snapshot

Orders created before the snapshot mechanism need backfill:

```bash
# Run backfill test
bun run test:e2e backfill-market-making-order-snapshots.e2e-spec.ts
```

Backfill process:
1. Query orders where `strategySnapshot IS NULL`
2. Resolve config using order's existing fields
3. Save snapshot to order

### For Definition Updates

When admin updates a definition:
1. `currentVersion` can be incremented manually
2. New orders will use updated config
3. Existing orders keep their pinned snapshot

## File Locations

```
server/src/
├── common/entities/market-making/
│   ├── strategy-definition.entity.ts       # Definition entity
│   └── strategy-definition-version.entity.ts  # Version snapshots
├── modules/market-making/strategy/
│   ├── config/
│   │   └── strategy-controller.types.ts    # Types
│   ├── controllers/
│   │   ├── strategy-controller.registry.ts # Controller registry
│   │   ├── pure-market-making-strategy.controller.ts
│   │   ├── arbitrage-strategy.controller.ts
│   │   ├── volume-strategy.controller.ts
│   │   └── time-indicator-strategy.controller.ts
│   └── dex/
│       └── strategy-config-resolver.service.ts  # Config resolution
├── modules/admin/strategy/
│   ├── admin.controller.ts                 # Admin API
│   └── adminStrategy.service.ts            # Admin service
├── modules/market-making/user-orders/
│   ├── user-orders.controller.ts           # User API
│   └── market-making.processor.ts          # Queue processor
└── database/seeder/
    ├── seed.ts                             # Seed script
    ├── defaultSeedValues.ts                # Default values
    └── data/strategies/                    # YAML definitions
        ├── pure-market-making.yaml
        ├── arbitrage.yaml
        ├── volume.yaml
        └── time-indicator.yaml
```

## Related Documentation

- [MARKET_MAKING_FLOW.md](../flow/MARKET_MAKING_FLOW.md) - Overall execution flow
- [RUNTIME_SAFETY_MECHANISMS.md](./RUNTIME_SAFETY_MECHANISMS.md) - Safety mechanisms
- [../plans/2026-03-07-pooled-executor-architecture.md](../../plans/2026-03-07-pooled-executor-architecture.md) - Architecture decisions

---

**Created**: 2026-03-11
**Status**: Active
