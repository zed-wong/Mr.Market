/* eslint-disable @typescript-eslint/no-explicit-any */
import BigNumber from 'bignumber.js';
import type { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { createPureMarketMakingStrategyKey } from 'src/common/helpers/strategyKey';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { PureMarketMakingStrategyController } from 'src/modules/market-making/strategy/controllers/pure-market-making-strategy.controller';
import { StrategyControllerRegistry } from 'src/modules/market-making/strategy/controllers/strategy-controller.registry';
import { StrategyMarketDataProviderService } from 'src/modules/market-making/strategy/data/strategy-market-data-provider.service';
import { ExecutorRegistry } from 'src/modules/market-making/strategy/execution/executor-registry';
import { QuoteExecutorManagerService } from 'src/modules/market-making/strategy/intent/quote-executor-manager.service';
import { AdaptivePmmStateService } from 'src/modules/market-making/strategy/pmm/adaptive-pmm-state.service';
import { QuotePlannerService } from 'src/modules/market-making/strategy/quote/quote-planner.service';
import { StrategyInstanceLifecycleService } from 'src/modules/market-making/strategy/runtime/strategy-instance-lifecycle.service';
import { StrategySessionRegistryService } from 'src/modules/market-making/strategy/runtime/strategy-session-registry.service';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';
import { ExchangeOrderTrackerService } from 'src/modules/market-making/trackers/exchange-order-tracker.service';

type InMemoryStrategyRepo = {
  create: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  state: StrategyInstance[];
};

function createStrategyRepo(): InMemoryStrategyRepo {
  const state: StrategyInstance[] = [];

  return {
    state,
    create: jest.fn((input) => input),
    find: jest.fn(async () => [...state]),
    findOne: jest.fn(async ({ where } = {} as any) => {
      return (
        state.find((item) =>
          Object.entries(where || {}).every(
            ([key, value]) => (item as any)[key] === value,
          ),
        ) || null
      );
    }),
    save: jest.fn(async (input) => {
      state.push(input as StrategyInstance);

      return input;
    }),
    update: jest.fn(async (criteria, patch) => {
      for (const item of state) {
        if (
          Object.entries(criteria || {}).every(
            ([key, value]) => (item as any)[key] === value,
          )
        ) {
          Object.assign(item, patch);
        }
      }
    }),
  };
}

function createPureMmParams(orderId: string) {
  return {
    userId: 'system-user',
    clientId: orderId,
    marketMakingOrderId: orderId,
    pair: 'BTC/USDT',
    exchangeName: 'binance',
    bidSpread: 0.01,
    askSpread: 0.01,
    orderAmount: 1,
    orderRefreshTime: 1000,
    numberOfLayers: 1,
    priceSourceType: PriceSourceType.MID_PRICE,
    amountChangePerLayer: 0,
    amountChangeType: 'fixed' as const,
    hangingOrdersEnabled: true,
    volBasedSpread: true,
    spreadSigmaMultiplier: 2,
    adaptiveSizeEnabled: true,
    sizeVolScalingFactor: 5,
    imbalanceSkewFactor: 0.01,
    inventorySeverePivot: 0.3,
    cancelBudgetPerSec: 2,
    volatilitySampleMinCount: 3,
    staleSoftMs: 2000,
    staleHardMs: 10000,
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const soakDurationMs = Number(
  process.env.ADAPTIVE_PMM_SOAK_DURATION_MS || 10_000,
);
const tickIntervalMs = 1_000;

jest.setTimeout(soakDurationMs + 60_000);

describe('Adaptive PMM resident soak', () => {
  it('keeps one PMM runtime session stable for the configured wall-clock duration', async () => {
    const strategyRepo = createStrategyRepo();
    const exchangeOrderTrackerService = new ExchangeOrderTrackerService();
    const executorRegistry = new ExecutorRegistry();
    const dispatchedActions: any[] = [];
    const strategyMarketDataProviderService = {
      getReferencePrice: jest.fn().mockResolvedValue(100),
      getTrackedReferencePriceSnapshot: jest.fn().mockReturnValue({
        price: 100,
        sourceType: PriceSourceType.MID_PRICE,
        ageMs: 0,
      }),
      getTrackedOrderBookFreshness: jest.fn().mockReturnValue({
        fresh: true,
        ageMs: 0,
        freshnessTimestamp: '2026-04-09T00:00:00.000Z',
      }),
      getAdaptivePmmSignalSnapshot: jest.fn(),
    };
    const strategyIntentStoreService = {
      cancelPendingIntents: jest.fn().mockResolvedValue(0),
      clearLatestIntentsForStrategy: jest.fn(),
      createLimitOrderIntent: jest.fn(
        (
          runtimeInstanceKey: string,
          strategyKey: string,
          userId: string,
          clientId: string,
          exchange: string,
          pair: string,
          side: 'buy' | 'sell',
          price: BigNumber,
          qty: BigNumber,
          ts: string,
          suffix: string,
          executionCategory?: string,
          metadata?: Record<string, unknown>,
          postOnly?: boolean,
          accountLabel?: string,
          timeInForce?: 'GTC' | 'IOC',
        ) => ({
          type: 'CREATE_LIMIT_ORDER',
          intentId: `${strategyKey}:${ts}:${suffix}`,
          runtimeInstanceKey,
          strategyKey,
          userId,
          clientId,
          exchange,
          accountLabel,
          pair,
          side,
          price: price.toFixed(),
          qty: qty.toFixed(),
          executionCategory,
          postOnly,
          timeInForce,
          metadata,
          createdAt: ts,
          status: 'NEW',
        }),
      ),
      publishIntents: jest.fn(
        async (
          strategyKey: string,
          intents: any[],
          dispatch: (strategyKey: string, intents: any[]) => Promise<any>,
        ) => {
          await dispatch(strategyKey, intents);
        },
      ),
    };
    const orderScopedBalanceQueryService = {
      resolveInventoryRatio: jest.fn().mockResolvedValue(null),
      getAvailableBalancesForPair: jest.fn().mockResolvedValue({
        base: new BigNumber('10'),
        quote: new BigNumber('100000'),
        assets: { base: 'BTC', quote: 'USDT' },
      }),
    };
    const exchangeInitService = {
      isReady: jest.fn().mockReturnValue(true),
      getExchange: jest.fn().mockReturnValue({
        id: 'binance',
        fetchTicker: jest.fn().mockResolvedValue({ last: 100 }),
        markets: { 'BTC/USDT': { maker: 0.001 } },
      }),
      onExchangeReady: jest.fn().mockReturnValue(jest.fn()),
    } as any;
    const strategySessionRegistryService = new StrategySessionRegistryService(
      exchangeInitService,
      executorRegistry,
    );
    const quotePlannerService = new QuotePlannerService();
    const pureMarketMakingController = new PureMarketMakingStrategyController(
      new QuoteExecutorManagerService(),
      exchangeOrderTrackerService,
      strategyMarketDataProviderService as unknown as StrategyMarketDataProviderService,
      strategyIntentStoreService as any,
      undefined,
      undefined,
      new AdaptivePmmStateService(quotePlannerService),
      orderScopedBalanceQueryService as any,
      quotePlannerService,
      undefined,
      undefined,
      strategySessionRegistryService,
    );
    const strategyInstanceLifecycleService =
      new StrategyInstanceLifecycleService(
        exchangeInitService,
        strategyRepo as any,
        undefined,
        strategyMarketDataProviderService as unknown as StrategyMarketDataProviderService,
        strategyIntentStoreService as any,
        undefined,
        strategySessionRegistryService,
        undefined,
        undefined,
        undefined,
        undefined,
        exchangeOrderTrackerService,
      );
    const strategyService = new StrategyService(
      exchangeInitService,
      strategyRepo as any,
      undefined,
      new StrategyControllerRegistry([pureMarketMakingController]),
      {
        dispatchActions: jest.fn(
          async (_strategyKey: string, actions: any[]) => {
            dispatchedActions.push(...actions);

            return actions.map((action) => ({
              ...action,
              status: action.status || 'NEW',
            }));
          },
        ),
      } as any,
      executorRegistry,
      strategyIntentStoreService as any,
      undefined,
      undefined,
      undefined,
      undefined,
      pureMarketMakingController,
      strategySessionRegistryService,
      strategyInstanceLifecycleService,
    );
    const params = createPureMmParams('resident-adaptive-soak');
    const strategyKey = createPureMarketMakingStrategyKey(
      params.marketMakingOrderId,
    );
    const scenarios = [
      {
        freshness: 'fresh',
        volatility: 0.0001,
        imbalance: 0,
        history: [100, 100.01, 100],
        extraParams: {},
      },
      {
        freshness: 'fresh',
        volatility: 0.01,
        imbalance: 0.6,
        history: [100, 101, 102],
        extraParams: { currentBaseRatio: 0.2, inventoryTargetBaseRatio: 0.5 },
      },
      {
        freshness: 'fresh',
        volatility: 0.005,
        imbalance: -0.2,
        history: [100, 99.8, 100.2],
        extraParams: {},
      },
      {
        freshness: 'fresh',
        volatility: 0.002,
        imbalance: null,
        history: [100, 100.1, 100],
        extraParams: {},
      },
      {
        freshness: 'fresh',
        volatility: 0.03,
        imbalance: 0.8,
        history: [100, 103, 99],
        extraParams: { currentBaseRatio: 0.9, inventoryTargetBaseRatio: 0.5 },
      },
      {
        freshness: 'soft_stale',
        volatility: null,
        imbalance: null,
        history: [],
        extraParams: {},
      },
    ];
    let tick = 0;
    let maxActionsPerTick = 0;

    exchangeOrderTrackerService.upsertOrder({
      orderId: params.marketMakingOrderId,
      strategyKey,
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'resident-live-buy',
      side: 'buy',
      price: '99',
      qty: '1',
      status: 'open',
      createdAt: getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
    });
    strategyMarketDataProviderService.getAdaptivePmmSignalSnapshot.mockImplementation(
      () => {
        const scenario = scenarios[tick % scenarios.length];

        return {
          freshness: {
            status: scenario.freshness,
            ageMs: scenario.freshness === 'fresh' ? 0 : 3000,
            staleSoftMs: 2000,
            staleHardMs: 10000,
          },
          crash: {
            crashed: false,
            changeBps: null,
            windowMs: 60000,
            thresholdBps: null,
          },
          unavailableReasons:
            scenario.freshness === 'fresh' ? [] : ['soft_stale_order_book'],
          midPriceHistory: scenario.history.map((price, index) => ({
            price,
            ts: index + 1,
            sequence: index + 1,
          })),
          realizedVolatility: scenario.volatility,
          imbalance: scenario.imbalance,
          imbalanceDepthNotional: scenario.imbalance === null ? 5 : 100000,
        };
      },
    );

    await strategyService.executePureMarketMakingStrategy(params);
    const executor = executorRegistry.getExecutor('binance', 'BTC/USDT');

    expect(executor).toBeDefined();
    const session = executor!.getSession(params.marketMakingOrderId);

    expect(session).toBeDefined();
    session!.nextRunAtMs = 0;

    const startedAtMs = Date.now();
    const endAtMs = startedAtMs + soakDurationMs;

    while (Date.now() < endAtMs) {
      const scenario = scenarios[tick % scenarios.length];
      const previousActionCount = dispatchedActions.length;

      session!.params = {
        ...params,
        ...scenario.extraParams,
      };
      session!.nextRunAtMs = 0;
      await executor!.onTick(new Date().toISOString());

      const emitted = dispatchedActions.slice(previousActionCount);

      maxActionsPerTick = Math.max(maxActionsPerTick, emitted.length);
      expect(executorRegistry.getExecutor('binance', 'BTC/USDT')).toBe(
        executor,
      );
      expect(executor!.getSession(params.marketMakingOrderId)).toBeDefined();
      expect(emitted.length).toBeLessThanOrEqual(2);

      if (scenario.freshness !== 'fresh') {
        expect(
          emitted.every((action) => action.type !== 'CREATE_LIMIT_ORDER'),
        ).toBe(true);
      }

      tick += 1;
      await wait(tickIntervalMs);
    }

    expect(tick).toBeGreaterThanOrEqual(1);
    expect(maxActionsPerTick).toBeLessThanOrEqual(2);
    expect(executor!.getRecentErrors(params.marketMakingOrderId)).toEqual([]);
  });
});
