# Mr.Market Pooled Executor Architecture

**Version:** 1.0
**Date:** 2026-03-06
**Status:** Design Document

---

## Executive Summary

Mr.Market is a multi-user market making bot that operates on centralized and decentralized exchanges. Users create market making orders by transferring funds to the bot via Mixin, and the bot executes trading strategies on their behalf while participating in HuFi campaigns to earn rewards.

### Key Architectural Principles

1. **Pooled Execution**: One executor per exchange-trading-pair shared across all users
2. **Hummingbot Compatibility**: Controller/orchestrator/executor separation with tick-driven execution
3. **Multi-User Isolation**: Per-order session state with shared execution context
4. **Filesystem Scripts**: TypeScript execution scripts loaded from filesystem (hot-reloadable)
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
│  │  - Map: "BINANCE:BTC-USDT" → ExchangePairExecutor                │   │
│  │  - getOrCreateExecutor(exchange, pair)                           │   │
│  │  - removeExecutor(exchange, pair)                                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  ExchangePairExecutor (BINANCE:BTC-USDT)                        │   │
│  │  ├─ Shared Resources (per executor)                              │   │
│  │  │  ├─ OrderBookTracker (exchange order book - market data)      │   │
│  │  │  ├─ PrivateStreamTracker (user fills/status from exchange)    │   │
│  │  │  ├─ MarketDataProvider (aggregates market data)               │   │
│  │  │  └─ ClientOrderTracker (shadow ledger for order state)       │   │
│  │  │                                                              │   │
│  │  ├─ Campaign Tracking (NEW)                                     │   │
│  │  │  └─ CampaignTradeTracker (async trade recording)             │   │
│  │  │                                                              │   │
│  │  └─ Strategy Sessions (per-order isolation)                       │   │
│  │     ├─ StrategySession (User A's order state)                    │   │
│  │     ├─ StrategySession (User B's order state)                    │   │
│  │     └─ StrategySession (User C's order state)                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Execution Script Layer                              │
│           (TypeScript scripts loaded from filesystem)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  ScriptLoader                                                     │   │
│  │  - loadScript(scriptPath): IStrategyScript                       │   │
│  │  - watchAndReload(scriptPath): hot-reload on file changes        │   │
│  │  - cache: Map<string, IStrategyScript>                           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  IStrategyScript (Interface)                                     │   │
│  │  - validateConfig(config): boolean                               │   │
│  │  - createSession(config): StrategySessionState                  │   │
│  │  - onTick(session, marketData): ExecutorAction[]                │   │
│  │  - onOrderFilled(session, fill): ExecutorAction[]               │   │
│  │  - onError(session, error): ExecutorAction[]                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  File Structure:                                                         │
│  strategies/                                                             │
│    scripts/                                                              │
│      pure-market-making.ts                                              │
│      arbitrage.ts                                                        │
│      volume.ts                                                           │
│      time-indicator.ts                                                  │
│    templates/                                                            │
│      pure-market-making.yaml.template                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Exchange Connector Layer                              │
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
│  │  Intent Orchestrator & Execution                                 │   │
│  │  - ExecutorOrchestrator: Actions → Intents                       │   │
│  │  - StrategyIntentStore: Persist intents to DB                   │   │
│  │  - StrategyIntentWorker: Async worker for execution              │   │
│  │  - StrategyIntentExecution: Execute exchange actions             │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   Campaign Orchestration Layer                           │
│              (HuFi campaign integration and reward distribution)         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  CampaignService (EXISTING - HuFi Integration)                   │   │
│  │  - getCampaigns(): Fetch HuFi campaigns                         │   │
│  │  - joinCampaignWithAuth(): Join campaigns on behalf of bot       │   │
│  │  - Hourly cron to auto-join new campaigns                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  CampaignTradeTracker (NEW)                                      │   │
│  │  - recordTrade(fill): Async trade recording (non-blocking)       │   │
│  │  - calculateOrderScore(orderId, date): BigNumber                 │   │
│  │  - calculateTotalDailyVolume(date): BigNumber                    │   │
│  │  - getParticipantScore(campaignId, userId): BigNumber            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  OrderRevenueTracker (NEW)                                       │   │
│  │  - accumulateTrade(tradeData): Update order-level revenue        │   │
│  │  - getOrderRevenueBreakdown(orderId): OrderRevenueResponse       │   │
│  │  - Daily revenue breakdown per order                                │   │
│  │  - Order history (same data, just query from OrderDailySummary)  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  CampaignRewardAccounting (NEW)                                  │   │
│  │  - processDailyRewards(campaignId, date): Calculate rewards      │   │
│  │  - Determine reward pool (target met or proportional)            │   │
│  │  - Calculate user shares based on scores                         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  CampaignRewardDistributor (NEW)                                │   │
│  │  - distributeReward(userId, amount, campaignId, date)            │   │
│  │  - Credit user balances via BalanceLedger                       │   │
│  │  - Mixin internal transfers for distribution                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Strategy Definition Layer

#### StrategyDefinition Entity

```typescript
interface StrategyDefinition {
  id: string;
  key: string;                       // e.g., "pure_market_making"
  name: string;
  description?: string;

  // Script reference (filesystem)
  scriptPath: string;                // e.g., "strategies/scripts/pure-market-making.ts"

  // Config management
  configSchema: JSONSchema;          // What's configurable
  defaultConfig: Record<string, any>; // Admin-set defaults

  // Metadata
  enabled: boolean;
  visibility: 'system' | 'public';
  currentVersion: string;

  createdAt: Date;
  updatedAt: Date;
}
```

#### UserStrategyConfig Entity (NEW)

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

### 2. Pooled Executor Layer

#### ExecutorRegistry (NEW)

```typescript
class ExecutorRegistry {
  // Map: "BINANCE:BTC-USDT" -> ExchangePairExecutor
  private executors: Map<string, ExchangePairExecutor> = new Map();

  // Get or create executor for exchange-pair
  getOrCreateExecutor(
    exchange: string,
    pair: string
  ): ExchangePairExecutor;

  // Remove executor when no orders remain
  removeExecutor(exchange: string, pair: string): void;

  // Get all active executors
  getActiveExecutors(): ExchangePairExecutor[];
}
```

**Purpose**: Manages lifecycle of pooled executors per exchange-pair.

#### ExchangePairExecutor (NEW)

```typescript
class ExchangePairExecutor implements TickComponent {
  readonly exchange: string;
  readonly pair: string;

  // Shared resources per executor
  private marketDataProvider: MarketDataProvider;
  private orderBookTracker: OrderBookTracker;
  private privateStreamTracker: PrivateStreamTracker;
  private clientOrderTracker: ClientOrderTracker;

  // Campaign tracking (Redis-based, non-blocking)
  private tradeAggregator: InMemoryTradeAggregator;

  // Per-order isolation
  private strategySessions: Map<string, StrategySession> = new Map();

  // Lifecycle
  addOrder(
    orderId: string,
    userId: string,
    campaignId: string | null,  // NEW: campaign context
    strategyConfig: RuntimeConfig
  ): StrategySession;

  removeOrder(orderId: string): void;  // Also flushes Redis data to SQLite

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

#### StrategySession (NEW)

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

### 3. Execution Script Layer

#### IStrategyScript Interface

```typescript
interface IStrategyScript {
  // Script metadata
  readonly strategyKey: string;
  readonly version: string;

  // Config validation
  validateConfig(config: Record<string, any>): boolean;

  // Session lifecycle
  createSession(config: RuntimeConfig): StrategySessionState;

  // Execution methods (called per-session)
  onTick(
    session: StrategySessionState,
    marketData: MarketDataSnapshot
  ): ExecutorAction[];

  onOrderFilled(
    session: StrategySessionState,
    fill: OrderFill
  ): ExecutorAction[];

  onError(
    session: StrategySessionState,
    error: Error
  ): ExecutorAction[];
}
```

#### ScriptLoader (NEW)

```typescript
class ScriptLoader {
  // Load TypeScript script from filesystem
  async loadScript(scriptPath: string): Promise<IStrategyScript>;

  // Hot-reload on file changes (watcher)
  watchAndReload(scriptPath: string): void;

  // Cache loaded scripts
  private cache: Map<string, IStrategyScript> = new Map();

  // Get cached script
  getScript(strategyKey: string): IStrategyScript | undefined;
}
```

**Features**:
- **Hot-reload**: Watch filesystem for changes and reload scripts
- **Caching**: Keep loaded scripts in memory for performance
- **Type safety**: TypeScript compilation at load time

#### Example Script: Pure Market Making

```typescript
// strategies/scripts/pure-market-making.ts
import {
  IStrategyScript,
  StrategySessionState,
  ExecutorAction,
  MarketDataSnapshot,
  OrderFill
} from '../types';

export class PureMarketMakingStrategy implements IStrategyScript {
  readonly strategyKey = 'pure_market_making';
  readonly version = '1.0.0';

  validateConfig(config: Record<string, any>): boolean {
    return (
      typeof config.bid_spread === 'number' &&
      typeof config.ask_spread === 'number' &&
      typeof config.order_amount === 'number' &&
      typeof config.order_levels === 'number'
    );
  }

  createSession(config: RuntimeConfig): StrategySessionState {
    return {
      orderId: config.orderId,
      userId: config.userId,
      lastTick: Date.now(),
      activeOrders: [],
      position: { base: '0', quote: '0' },
      lastRefreshTime: 0,
    };
  }

  onTick(
    session: StrategySessionState,
    marketData: MarketDataSnapshot
  ): ExecutorAction[] {
    const config = session.runtimeConfig;
    const actions: ExecutorAction[] = [];

    // Calculate mid price
    const midPrice = BigNumber(marketData.bestBid)
      .plus(marketData.bestAsk)
      .div(2);

    // Calculate bid/ask prices
    const bidPrice = midPrice.multipliedBy(1 - config.bid_spread);
    const askPrice = midPrice.multipliedBy(1 + config.ask_spread);

    // Check if we need to refresh orders
    const now = Date.now();
    const shouldRefresh =
      now - session.lastRefreshTime >= config.order_refresh_time * 1000;

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

        actions.push({
          type: 'CREATE_LIMIT_ORDER',
          side: 'BUY',
          price: bidPrice.multipliedBy(1 - levelSpread).toFixed(),
          amount: config.order_amount,
          clientId: `${session.orderId}-bid-${level}`,
        });

        actions.push({
          type: 'CREATE_LIMIT_ORDER',
          side: 'SELL',
          price: askPrice.multipliedBy(1 + levelSpread).toFixed(),
          amount: config.order_amount,
          clientId: `${session.orderId}-ask-${level}`,
        });
      }

      session.lastRefreshTime = now;
    }

    return actions;
  }

  onOrderFilled(
    session: StrategySessionState,
    fill: OrderFill
  ): ExecutorAction[] {
    // Update position
    if (fill.side === 'BUY') {
      session.position.base = BigNumber(session.position.base)
        .plus(fill.amount)
        .toFixed();
    } else {
      session.position.base = BigNumber(session.position.base)
        .minus(fill.amount)
        .toFixed();
    }

    // Remove filled order from active orders
    session.activeOrders = session.activeOrders.filter(
      o => o.exchangeOrderId !== fill.exchangeOrderId
    );

    // Re-quote immediately
    return this.onTick(session, session.lastMarketData);
  }

  onError(
    session: StrategySessionState,
    error: Error
  ): ExecutorAction[] {
    // Log error and pause strategy
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

### 4. Campaign Integration Layer

#### Design Principles

**IMPORTANT**: To handle SQLite's write limitations, the campaign tracking system uses:
- **Redis for real-time aggregation** (no DB writes on each fill)
- **SQLite for persistent storage** (only daily summaries)
- **Same system for order history and campaign tracking**

This design reduces DB writes from ~400/second to ~100/day (a 17,000× reduction).

#### Redis-Based Trade Aggregator

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
  takerBuyVolume: string;           // Total TAKER_BUY volume
  takerSellVolume: string;          // Total TAKER_SELL volume
  totalScore: string;               // Weighted score (volume × weight)
  tradeCount: number;               // Number of trades

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

#### Redis Fallback

```typescript
class HybridTradeAggregator {
  private redis: Redis | null = null;
  private fallbackMap: Map<string, Map<string, any>> = new Map();

  async recordTrade(tradeData: TradeData): Promise<void> {
    if (this.redis?.isReady) {
      // Use Redis
      await this.redisRecord(tradeData);
    } else {
      // Fallback to in-memory (will lose on restart, but system keeps running)
      this.inMemoryRecord(tradeData);
    }
  }
}

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
   └─ Resolve strategyDefinitionId from order
   └─ Get UserStrategyConfig (user's overrides or defaults)
   └─ Merge: defaultConfig + userOverrides → RuntimeConfig
   └─ Bind to ExchangePairExecutor (get or create for exchange-pair)
   └─ Create StrategySession with runtime config
   └─ Load execution script from filesystem (strategies/scripts/*.ts)
```

### 2. Execution Loop Flow

```
ClockTickCoordinator ticks at global cadence (e.g., 1s)
   │
   ▼
For each ExchangePairExecutor:
   │
   ├─ OrderBookTracker.onTick() (order 1 - market data)
   ├─ PrivateStreamTracker.onTick() (order 2 - user fills)
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
│                  (Must be < 1ms, unchanged)                      │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼ (Redis HINCRBY - O(1), super fast)
┌─────────────────────────────────────────────────────────────────┐
│                    Redis (Real-Time)                              │
│  Key: "trade:{orderId}:{date}"                                  │
│  Fields: maker_volume, taker_buy_volume, taker_sell_volume,   │
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

### Background Processing

Trade recording happens in Redis, not SQLite:

```typescript
// Fill arrives (in hot path)
async onFill(fill: OrderFill): Promise<void> {
  session.onFill(fill);

  // Redis HINCRBY - super fast, O(1)
  await this.tradeAggregator.recordTrade({
    orderId: fill.orderId,
    userId: fill.userId,
    tradeType: fill.executionType === 'maker' ? 'MAKER' : 'TAKER',
    volume: fill.filledAmount,  // Use FILLED amount, not order amount!
    timestamp: fill.timestamp,
  });

  // Return immediately - no await on DB write!
}
```

### Redis Fallback

If Redis is unavailable, use in-memory Map:

```typescript
async recordTrade(tradeData: TradeData): Promise<void> {
  if (this.redis?.isReady) {
    // Use Redis (fast)
    await this.redis.hincrbyfloat(...);
  } else {
    // Fallback to in-memory (slower but keeps system running)
    this.inMemoryMap.getOrCreate(tradeData.orderId).increment(tradeData);
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
  campaignId?: string;           // Linked campaign (if any)

  exchange: string;
  pair: string;

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
  executorKey: string;  // "BINANCE:BTC-USDT"
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

// Export strategy definition as YAML (NEW)
GET /admin/strategy/definitions/:key/export
Response: YAML file download
Headers: Content-Disposition: attachment; filename="{key}.yaml"

// Import strategy definition from YAML (FUTURE)
POST /admin/strategy/definitions/import
Body: multipart/form-data (YAML file)
Response: Created strategy definition

// User Strategy Config Management (NEW)
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
│   │   ├── orchestration/          # NEW: Pooled executor orchestration
│   │   │   ├── executor-registry.service.ts
│   │   │   ├── exchange-pair-executor.service.ts
│   │   │   └── strategy-session.service.ts
│   │   │
│   │   ├── scripts/                # NEW: Script loading
│   │   │   ├── script-loader.service.ts
│   │   │   └── script-registry.service.ts
│   │   │
│   │   ├── campaigns/              # NEW: Campaign tracking & rewards
│   │   │   ├── campaign-trade-tracker.service.ts
│   │   │   ├── order-revenue-tracker.service.ts
│   │   │   ├── campaign-reward-accounting.service.ts
│   │   │   └── campaign-reward-distributor.service.ts
│   │   │
│   │   ├── strategy/
│   │   │   ├── execution/          # EXISTING: Intent pipeline
│   │   │   │   ├── strategy-intent-store.service.ts
│   │   │   │   ├── strategy-intent-worker.service.ts
│   │   │   │   └── strategy-intent-execution.service.ts
│   │   │   │
│   │   │   ├── intent/             # EXISTING: Orchestrator
│   │   │   │   └── executor-orchestrator.service.ts
│   │   │   │
│   │   │   └── dex/                # MODIFIED: Config resolution
│   │   │       └── strategy-config-resolver.service.ts
│   │   │
│   │   ├── trackers/               # EXISTING: Market data
│   │   │   ├── order-book-tracker.service.ts
│   │   │   └── private-stream-tracker.service.ts
│   │   │
│   │   ├── execution/              # EXISTING: Exchange connector
│   │   │   └── exchange-connector-adapter.service.ts
│   │   │
│   │   ├── ledger/                 # EXISTING: Balance ledger
│   │   │   └── balance-ledger.service.ts
│   │   │
│   │   ├── user-orders/            # EXISTING: Order processing
│   │   │   ├── user-orders.service.ts
│   │   │   └── market-making.processor.ts
│   │   │
│   │   └── tick/                   # EXISTING: Global tick
│   │       └── clock-tick-coordinator.service.ts
│   │
│   ├── campaign/                   # EXISTING: HuFi integration
│   │   └── campaign.service.ts
│   │
│   ├── mixin/                      # EXISTING: Mixin integration
│   │   ├── snapshots/
│   │   │   └── snapshots.service.ts
│   │   └── transaction/
│   │       └── transaction.service.ts
│   │
│   └── admin/                      # MODIFIED: Add script management
│       └── strategy/
│           └── adminStrategy.service.ts
│
├── strategies/                     # NEW: Strategy scripts
│   ├── scripts/
│   │   ├── pure-market-making.ts
│   │   ├── arbitrage.ts
│   │   ├── volume.ts
│   │   └── time-indicator.ts
│   │
│   └── templates/
│       ├── pure-market-making.yaml.template
│       ├── arbitrage.yaml.template
│       ├── volume.yaml.template
│       └── time-indicator.yaml.template
│
└── common/
    └── entities/
        ├── market-making/
        │   ├── market-making-order.entity.ts        # EXISTING
        │   ├── strategy-definition.entity.ts        # MODIFIED: Add scriptPath
        │   └── user-strategy-config.entity.ts       # NEW
        │
        └── ledger/
            ├── ledger-entry.entity.ts               # EXISTING
            └── balance-read-model.entity.ts         # EXISTING
```

---

## Migration Path

### Phase 1: Add New Components (Zero Risk)

**Objective**: Implement new components without touching existing code.

1. Create `StrategyScriptLoader` service
2. Create `ExecutorRegistry` service
3. Create `ExchangePairExecutor` class
4. Create `StrategySession` class
5. Create `CampaignTradeTracker` service
6. Create `OrderRevenueTracker` service
7. Create `CampaignRewardAccounting` service
8. Create `CampaignRewardDistributor` service

**Testing**:
- Unit tests for each new component
- Integration tests for campaign flow
- Load tests for trade recording queue

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
2. Add migration for `CampaignTradeRecord` table
3. Add migration for `OrderRevenueRecord` table
4. Add migration for `OrderExecutionBinding` table
5. Backfill existing orders with execution bindings

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

### Strategy Configuration

```yaml
# strategies/templates/pure-market-making.yaml.template
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

// Trade recording health
GET /health/trade-recording
Response: {
  queueDepth: number;
  processingRate: number; // trades per second
  lastProcessedAt: string;
  isHealthy: boolean;
};
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
- **Check**: System falls back to in-memory Map (no data loss, just slower)

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

## Changelog

- **2026-03-06**: Added Redis-based trade aggregation (no per-fill DB writes)
  - Use Redis HINCRBY for real-time aggregation
  - Write OrderDailySummary to SQLite only on stop or daily cron
  - Added flush on order stop
  - Added reconciliation via exchange API
  - Added Redis fallback when unavailable
  - Added timezone configuration (UTC default, admin configurable)
  - Unified order history and campaign tracking (same data source)
