# User Stream Model

## Overview

The user stream model provides a normalized event layer for private exchange data (orders, trades, balances). It abstracts exchange-specific WebSocket differences behind a unified internal contract.

## Event Model

All private exchange data flows through a single `UserStreamEvent` discriminated union:

- `kind: 'order'` — order status updates from `watchOrders()`
- `kind: 'trade'` — individual fill/trade events from `watchMyTrades()`
- `kind: 'balance'` — balance snapshots/deltas from `watchBalance()`

Every event carries `exchange + accountLabel` as isolation keys, ensuring multi-tenant / multi-API-key safety.

## Architecture

```
[Exchange WS private endpoint]
  -> ConnectorUserStreamDataSource.listen()
  -> UserStreamEventNormalizer.normalize*()
  -> UserStreamEvent queue
  -> UserStreamTrackerService.onTick()/drain()
       -> BalanceStateCache.applyBalanceUpdate()
       -> ExchangeOrderTrackerService.applyOrderUpdate()
       -> FillRoutingService / executor.onFill()

Backup / recovery:
  -> ExchangeOrderTrackerService.fetchOrder() reconciliation
  -> BalanceStateRefreshService.fetchBalance() reconciliation
```

## Connector Capability Tiers

| Tier | Capabilities | Fallback |
|---|---|---|
| full | watchOrders + watchMyTrades + watchBalance | None needed |
| partial | watchOrders only | REST fetchBalance, infer fills from order updates |
| rest_only | No private WS | REST fetchOrder + fetchBalance polling |

## Key Files

- `server/src/modules/market-making/user-stream/user-stream-event.types.ts` — Event type definitions
- `server/src/modules/market-making/user-stream/connector-user-stream-datasource.interface.ts` — Datasource interface
- `server/src/modules/market-making/user-stream/user-stream-event-normalizer.interface.ts` — Normalizer interface
