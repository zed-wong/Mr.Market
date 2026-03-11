# Execution Documentation

This directory contains detailed documentation for the Mr.Market execution layer.

## Directory Structure

```
docs/execution/
├── README.md                    # This file
├── CHANGELOG.md                 # Execution flow changelog
├── flow/
│   └── MARKET_MAKING_FLOW.md    # Market making end-to-end flow
├── ui/
│   └── DESIGN_PATTERN.md        # UI design patterns (Svelte/DaisyUI)
└── utils/
    ├── STRATEGY_DEFINITION_GUIDE.md    # Dynamic strategy definition system
    ├── RUNTIME_SAFETY_MECHANISMS.md    # Runtime safety and idempotency
    ├── MIXIN_MEMO_ENCODING.md          # Mixin memo binary encoding
    └── NETWORK_MAPPING_GUIDE.md        # Mixin chain to CCXT network mapping
```

## Quick Links

### Core Flows

- [Market Making Flow](./flow/MARKET_MAKING_FLOW.md) - Complete flow from order creation to execution
- [Strategy Definition Guide](./utils/STRATEGY_DEFINITION_GUIDE.md) - Dynamic strategy configuration system

### Safety & Reliability

- [Runtime Safety Mechanisms](./utils/RUNTIME_SAFETY_MECHANISMS.md) - Idempotency, ledger safety, fill routing

### Integration Guides

- [Mixin Memo Encoding](./utils/MIXIN_MEMO_ENCODING.md) - Binary encoding for payment memos
- [Network Mapping](./utils/NETWORK_MAPPING_GUIDE.md) - Chain ID to network mapping

### UI

- [Design Pattern](./ui/DESIGN_PATTERN.md) - Frontend stack and design tokens

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Strategy Definition Layer                 │
│  Admin-managed JSON config schema + defaults                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Order Orchestration Layer                 │
│  Intent creation → Payment → Snapshot pinning               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Pooled Executor Layer                     │
│  ExecutorRegistry → ExchangePairExecutor (by exchange:pair) │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Intent Execution Layer                    │
│  Controller → Orchestrator → Intent → Exchange              │
└─────────────────────────────────────────────────────────────┘
```

## Key Concepts

| Concept | Description | Doc |
|---------|-------------|-----|
| **Strategy Snapshot** | Orders pin config at creation time | [Strategy Definition Guide](./utils/STRATEGY_DEFINITION_GUIDE.md) |
| **Pooled Executors** | Share market data per exchange:pair | [Market Making Flow](./flow/MARKET_MAKING_FLOW.md) |
| **Fill Routing** | clientOrderId parsing + fallback | [Runtime Safety](./utils/RUNTIME_SAFETY_MECHANISMS.md) |
| **Ledger Safety** | Idempotent balance mutations | [Runtime Safety](./utils/RUNTIME_SAFETY_MECHANISMS.md) |

## Related Docs

- [Code Design Docs](../code/README.md) - Module map, business flows, entity ownership
- [Plans](../plans/) - Architecture plans and implementation todos
