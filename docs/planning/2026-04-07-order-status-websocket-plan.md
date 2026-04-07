# Real-time Order Status via Socket.io — Implementation Plan

## Goal
When a user opens the OrderDetailsDialog, active orders, active intents, health, balances, and spread update in real time via Socket.io instead of a one-shot REST fetch.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  ClockTickCoordinatorService (1s tick loop)      │
│    └─ OrderStatusBroadcasterService (TickComponent, order=99) │
│         • on each tick, for each subscribed orderId:          │
│           calls AdminDirectMarketMakingService.getDirectOrderStatus() │
│           emits to Socket.io room "order:{orderId}"           │
└──────────────────────┬──────────────────────────┘
                       │ emits "orderStatusUpdate"
                       ▼
┌──────────────────────────────────────────────────┐
│  AdminMarketMakingGateway (Socket.io /admin-mm)  │
│    • subscribeOrderStatus({ orderId })           │
│      → joins room "order:{orderId}"              │
│      → adds orderId to broadcaster subscriptions │
│    • unsubscribeOrderStatus({ orderId })         │
│      → leaves room, removes if no clients left   │
│    • handleDisconnect                            │
│      → cleans up all rooms for that client        │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│  Frontend (SvelteKit)                            │
│    interface/src/lib/helpers/mrm/admin-socket.ts │
│      connectAdminOrderStatus(orderId, onData)    │
│      disconnectAdminOrderStatus()                │
│                                                  │
│    +page.svelte (direct MM page)                 │
│      openOrderDetails → connectAdminOrderStatus  │
│      closeOrderDetails → disconnectAdminOrderStatus │
│      onData callback → detailsData = payload     │
│                                                  │
│    OrderDetailsDialog.svelte                     │
│      no changes needed (reactive via detailsData)│
└──────────────────────────────────────────────────┘
```

---

## Files to Create

### 1. `server/src/modules/admin/market-making/admin-mm.gateway.ts`

New Socket.io gateway on namespace `/admin-mm`.

```ts
@WebSocketGateway(parseInt(webSocketPort, 10), {
  namespace: '/admin-mm',
  cors: { origin: wsAllowedOrigins, credentials: true },
})
export class AdminMarketMakingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: SocketIOServer;

  // Track which orderIds have subscribers
  private subscribedOrderIds = new Set<string>();

  @SubscribeMessage('subscribeOrderStatus')
  handleSubscribe(client: Socket, { orderId }: { orderId: string }) {
    client.join(`order:${orderId}`);
    this.subscribedOrderIds.add(orderId);
  }

  @SubscribeMessage('unsubscribeOrderStatus')
  handleUnsubscribe(client: Socket, { orderId }: { orderId: string }) {
    client.leave(`order:${orderId}`);
    this.cleanupOrderIfEmpty(orderId);
  }

  handleDisconnect(client: Socket) {
    // Socket.io auto-removes from rooms on disconnect
    // Clean up subscribedOrderIds for rooms with 0 clients
    for (const orderId of this.subscribedOrderIds) {
      this.cleanupOrderIfEmpty(orderId);
    }
  }

  getSubscribedOrderIds(): Set<string> {
    return this.subscribedOrderIds;
  }

  emitOrderStatus(orderId: string, data: DirectOrderStatus): void {
    this.server.to(`order:${orderId}`).emit('orderStatusUpdate', data);
  }

  private cleanupOrderIfEmpty(orderId: string): void {
    const room = this.server.adapter.rooms?.get(`order:${orderId}`);
    if (!room || room.size === 0) {
      this.subscribedOrderIds.delete(orderId);
    }
  }
}
```

**Key decisions:**
- Separate namespace `/admin-mm` (not on `/market`) — keeps admin traffic isolated, different auth concerns later
- Uses Socket.io rooms (`order:{orderId}`) so multiple clients viewing the same order share one broadcast
- `subscribedOrderIds` set lets the broadcaster know which orders need status fetches — avoids computing status for orders nobody is watching
- Reuse same `WS_PORT` and CORS config pattern from `MarketDataGateway`

---

### 2. `server/src/modules/admin/market-making/order-status-broadcaster.service.ts`

New `TickComponent` that runs on each clock tick.

```ts
@Injectable()
export class OrderStatusBroadcasterService
  implements TickComponent, OnModuleInit, OnModuleDestroy
{
  constructor(
    private readonly clockTickCoordinator: ClockTickCoordinatorService,
    private readonly adminDirectMmService: AdminDirectMarketMakingService,
    private readonly gateway: AdminMarketMakingGateway,
  ) {}

  onModuleInit() {
    this.clockTickCoordinator.register('order-status-broadcaster', this, 99);
  }

  onModuleDestroy() {
    this.clockTickCoordinator.unregister('order-status-broadcaster');
  }

  async start() {}
  async stop() {}
  async health() { return true; }

  async onTick(_ts: string) {
    const orderIds = this.gateway.getSubscribedOrderIds();
    if (orderIds.size === 0) return;

    // Fetch and emit in parallel, but cap concurrency
    const promises = [...orderIds].map(async (orderId) => {
      try {
        const status = await this.adminDirectMmService.getDirectOrderStatus(orderId);
        this.gateway.emitOrderStatus(orderId, status);
      } catch {
        // Order may have been deleted; skip silently
      }
    });

    await Promise.all(promises);
  }
}
```

**Key decisions:**
- Order `99` — runs last, after all trackers/executors have updated state for the tick. This ensures we broadcast the freshest data.
- No-op when `subscribedOrderIds` is empty — zero overhead when no admin has the dialog open.
- `getDirectOrderStatus()` is reused as-is. It aggregates executor health, open orders, intents, balances, and spread — same payload the REST endpoint returns. No duplication.
- `fetchBalance()` (exchange API call inside `getDirectOrderStatus`) runs on every tick. This is acceptable because: (a) it only runs for actively watched orders (typically 1), and (b) the tick interval is 1s which matches exchange rate limits. If this becomes a concern later, balance fetching can be cached with a TTL inside the service.

---

### 3. `interface/src/lib/helpers/mrm/admin-socket.ts`

New client-side Socket.io helper for admin real-time features.

```ts
import { io, type Socket } from 'socket.io-client';
import { MRM_SOCKET_URL } from '$lib/helpers/constants';
import type { DirectOrderStatus } from '$lib/types/hufi/admin-direct-market-making';

let socket: Socket | null = null;
let currentOrderId: string | null = null;

export function connectAdminOrderStatus(
  orderId: string,
  onData: (data: DirectOrderStatus) => void,
): void {
  disconnectAdminOrderStatus();

  socket = io(`${MRM_SOCKET_URL}/admin-mm`);
  currentOrderId = orderId;

  socket.on('connect', () => {
    socket?.emit('subscribeOrderStatus', { orderId });
  });

  socket.on('orderStatusUpdate', (data: DirectOrderStatus) => {
    onData(data);
  });

  socket.on('disconnect', () => {
    // Reconnection is handled automatically by socket.io-client
  });
}

export function disconnectAdminOrderStatus(): void {
  if (socket && currentOrderId) {
    socket.emit('unsubscribeOrderStatus', { orderId: currentOrderId });
  }
  socket?.disconnect();
  socket = null;
  currentOrderId = null;
}
```

**Key decisions:**
- Separate connection from the market data socket — admin namespace is different
- Module-level singleton — only one order can be watched at a time (dialog shows one order)
- `disconnectAdminOrderStatus()` unsubscribes before disconnecting for clean server-side cleanup
- Auto-reconnect is built into socket.io-client by default

---

## Files to Modify

### 4. `server/src/modules/admin/admin.module.ts`

Add imports for the new gateway and broadcaster:

```diff
+ import { TickModule } from '../market-making/tick/tick.module';
+ import { AdminMarketMakingGateway } from './market-making/admin-mm.gateway';
+ import { OrderStatusBroadcasterService } from './market-making/order-status-broadcaster.service';

@Module({
  imports: [
    ...existing,
+   TickModule,
  ],
  providers: [
    ...existing,
+   AdminMarketMakingGateway,
+   OrderStatusBroadcasterService,
  ],
})
```

---

### 5. `interface/src/routes/(bottomNav)/(admin)/manage/market-making/direct/+page.svelte`

Wire up socket in `openOrderDetails` / `closeOrderDetails`:

```diff
+ import { onDestroy } from "svelte";
+ import {
+   connectAdminOrderStatus,
+   disconnectAdminOrderStatus,
+ } from "$lib/helpers/mrm/admin-socket";

  async function openOrderDetails(order: DirectOrderSummary) {
    detailsOrder = order;
    showOrderDetails = true;
    detailsLoading = true;
    const token = getToken();
    if (!token) { detailsLoading = false; return; }
    try {
      detailsData = await getDirectOrderStatus(order.orderId, token);
    } catch {
      detailsData = null;
    } finally {
      detailsLoading = false;
    }
+   // Subscribe to real-time updates
+   connectAdminOrderStatus(order.orderId, (data) => {
+     detailsData = data;
+     // Also sync runtimeState on the order reference for button state
+     if (detailsOrder) {
+       detailsOrder = { ...detailsOrder, runtimeState: data.runtimeState };
+     }
+   });
  }

  function closeOrderDetails() {
+   disconnectAdminOrderStatus();
    showOrderDetails = false;
    detailsOrder = null;
    detailsData = null;
    detailsLoading = false;
  }

+ onDestroy(disconnectAdminOrderStatus);
```

**Key detail:** `detailsOrder.runtimeState` is synced from the socket payload so the Start/Stop button in OrderDetailsDialog stays in sync (it derives `isRunning` from `order.runtimeState`).

---

## Files NOT Modified

- **`OrderDetailsDialog.svelte`** — No changes. It's already reactive to `data` and `order` props.
- **`admin-direct-mm.service.ts`** — No changes. `getDirectOrderStatus()` is reused as-is.
- **`admin-direct-mm.controller.ts`** — No changes. REST endpoint stays for initial load.
- **Types** — No changes. `DirectOrderStatus` already has all needed fields.

---

## Execution Order

| Step | File | Type | Depends on |
|------|------|------|------------|
| 1 | `server/.../admin-mm.gateway.ts` | Create | — |
| 2 | `server/.../order-status-broadcaster.service.ts` | Create | Step 1 |
| 3 | `server/.../admin.module.ts` | Edit | Steps 1-2 |
| 4 | `interface/.../admin-socket.ts` | Create | — |
| 5 | `interface/.../direct/+page.svelte` | Edit | Step 4 |

Steps 1-3 (server) and Step 4 (client) are independent and can be done in parallel. Step 5 depends on Step 4.

---

## Data Flow Summary

```
Every ~1s tick:
  ClockTickCoordinator.tickOnce()
    → ... other components (trackers, executors update state) ...
    → OrderStatusBroadcasterService.onTick()
        → for each subscribed orderId:
            AdminDirectMmService.getDirectOrderStatus(orderId)
            → gateway.emitOrderStatus(orderId, payload)
                → Socket.io room "order:{orderId}"
                    → client "orderStatusUpdate" event
                        → detailsData = payload (Svelte reactive assignment)
                            → OrderDetailsDialog re-renders
```

---

## Server Support for Mock Fields

Two UI fields currently use hardcoded mock data (marked with a `mock` badge in the dialog). Here's the plan to make them real:

### 1. Fills count (last 1 hour)

**Where the data lives:** `ExchangeOrderTrackerService` tracks open orders and `cumulativeFilledQty`. Fills flow through `PrivateStreamTrackerService` → `FillRoutingService`. However, neither service retains a time-windowed fill history.

**Steps:**

| Step | File | Change |
|------|------|--------|
| 1 | `server/.../trackers/exchange-order-tracker.service.ts` | Add `fillLog: Map<string, { ts: string; side: string; qty: string }[]>` keyed by `strategyKey`. Push entry on each detected fill. Prune entries older than 1h on each tick. |
| 2 | `server/.../trackers/exchange-order-tracker.service.ts` | Add `getFillCount(strategyKey: string, windowMs: number): number` that counts entries within window. |
| 3 | `server/.../admin-direct-mm.service.ts` | In `getDirectOrderStatus()`, call `getFillCount(strategyKey, 3600000)` → add `fillCount1h` to response. |
| 4 | `interface/.../admin-direct-market-making.ts` | Add `fillCount1h?: number` to `DirectOrderStatus`. |
| 5 | `OrderDetailsDialog.svelte` | Replace `mockFills1h` with `data.fillCount1h ?? 0`, remove mock badge. |

### 2. Recent errors (last N)

**Where the data lives:** Errors are currently only logged via `CustomLogger` and lost. No in-memory error buffer exists per order.

**Steps:**

| Step | File | Change |
|------|------|--------|
| 1 | `server/.../strategy/execution/exchange-pair-executor.ts` | Add `recentErrors: Map<string, { ts: string; message: string }[]>` keyed by `orderId`. In existing `catch` blocks around strategy tick execution, push errors. Cap at 10 per order, evict oldest on overflow. |
| 2 | `server/.../strategy/execution/exchange-pair-executor.ts` | Add `getRecentErrors(orderId: string): { ts: string; message: string }[]` getter. |
| 3 | `server/.../admin-direct-mm.service.ts` | In `getDirectOrderStatus()`, call `executor.getRecentErrors(orderId)` → add `recentErrors` to response. |
| 4 | `interface/.../admin-direct-market-making.ts` | Add `recentErrors?: { ts: string; message: string }[]` to `DirectOrderStatus`. |
| 5 | `OrderDetailsDialog.svelte` | Replace `mockErrors` with `data.recentErrors ?? []`, remove mock badge. |

Both changes are additive — no existing behavior changes, no DB schema, no new dependencies.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Order deleted while dialog open | `getDirectOrderStatus` throws → broadcaster catches & skips → client keeps last known data |
| Multiple admin clients watching same order | Same Socket.io room, one `getDirectOrderStatus` call, one emit fans out |
| Client disconnects abruptly | `handleDisconnect` cleans up rooms; `cleanupOrderIfEmpty` removes orderId from set |
| Server restarts | socket.io-client auto-reconnects, re-emits `subscribeOrderStatus` on `connect` event |
| Dialog closed while initial REST is in-flight | `closeOrderDetails` calls `disconnectAdminOrderStatus`; stale REST response still assigns `detailsData` but dialog is hidden (`show=false`) |
| `fetchBalance` rate limit | Already throttled to 1 call/tick/order; if exchange rejects, warning is logged and `inventoryBalances` returns `[]` |
