# Operations Docs

This directory contains execution, testing, integration, and implementation guides for Mr.Market.

## Directory Structure

```text
docs/operations/
├── README.md
├── testing/
│   └── market-making.md
├── ui/
│   └── design-pattern.md
├── runtime/
│   ├── network-mapping-guide.md
│   └── runtime-safety-mechanisms.md
├── strategy/
│   └── strategy-definition-guide.md
└── integrations/
    └── mixin-memo-encoding.md
```

## Quick Links

### Core Flows

- [Market Making Flow](../architecture/market-making-flow.md) - Complete flow from order creation to execution
- [Strategy Definition Guide](./strategy/strategy-definition-guide.md) - Dynamic strategy configuration system

### Safety & Reliability

- [Runtime Safety Mechanisms](./runtime/runtime-safety-mechanisms.md) - Idempotency, ledger safety, fill routing

### Integration Guides

- [Mixin Memo Encoding](./integrations/mixin-memo-encoding.md) - Binary encoding for payment memos
- [Network Mapping](./runtime/network-mapping-guide.md) - Chain ID to network mapping

### UI

- [Design Pattern](./ui/design-pattern.md) - Frontend stack and design tokens

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
| **Strategy Snapshot** | Orders pin config at creation time | [Strategy Definition Guide](./strategy/strategy-definition-guide.md) |
| **Pooled Executors** | Share market data per exchange:pair | [Market Making Flow](../architecture/market-making-flow.md) |
| **Fill Routing** | clientOrderId parsing + fallback | [Runtime Safety](./runtime/runtime-safety-mechanisms.md) |
| **Ledger Safety** | Idempotent balance mutations | [Runtime Safety](./runtime/runtime-safety-mechanisms.md) |

## Related Docs

- [Architecture Docs](../architecture/README.md) - Module map, business flows, entity ownership
- [Roadmap Docs](../roadmap/README.md) - Active plans and implementation todo
