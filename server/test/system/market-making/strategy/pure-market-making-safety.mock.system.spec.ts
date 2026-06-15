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
import {
  ExchangeOrderTrackerService,
  TrackedOrder,
} from 'src/modules/market-making/trackers/exchange-order-tracker.service';

type InMemoryStrategyRepo = {
  create: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
};

function createStrategyRepo(
  seeded: StrategyInstance[] = [],
): InMemoryStrategyRepo & { state: StrategyInstance[] } {
  const state = [...seeded];

  return {
    state,
    create: jest.fn((input) => input),
    find: jest.fn(async ({ where } = {} as any) => {
      if (!where) {
        return [...state];
      }

      return state.filter((item) =>
        Object.entries(where).every(
          ([key, value]) => (item as any)[key] === value,
        ),
      );
    }),
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
  };
}

describe('Pure market making safety gaps (mock system)', () => {
  let strategyRepo: ReturnType<typeof createStrategyRepo>;
  let exchangeOrderTrackerService: ExchangeOrderTrackerService;
  let executorRegistry: ExecutorRegistry;
  let strategyService: StrategyService;
  let pureMarketMakingController: PureMarketMakingStrategyController;
  let strategySessionRegistryService: StrategySessionRegistryService;
  let exchangeConnectorAdapterService: {
    cancelOrder: jest.Mock;
    fetchBalance: jest.Mock;
    fetchOpenOrders: jest.Mock;
    fetchOrder: jest.Mock;
    loadTradingRules: jest.Mock;
    quantizeOrder: jest.Mock;
  };
  let exchangeOrderMappingService: {
    findByClientOrderId: jest.Mock;
    findByExchangeOrderId: jest.Mock;
  };
  let strategyIntentStoreService: {
    cancelPendingIntents: jest.Mock;
    clearLatestIntentsForStrategy: jest.Mock;
    createLimitOrderIntent: jest.Mock;
    publishIntents: jest.Mock;
  };
  let executorOrchestratorService: {
    dispatchActions: jest.Mock;
  };
  let strategyMarketDataProviderService: {
    getReferencePrice: jest.Mock;
    getTrackedReferencePriceSnapshot: jest.Mock;
    getTrackedOrderBookFreshness: jest.Mock;
    getAdaptivePmmSignalSnapshot: jest.Mock;
  };
  let runtimeObservationService: { getPressure: jest.Mock };
  let pmmMarkoutEvaluatorService: {
    evaluateDue: jest.Mock;
    getToxicity: jest.Mock;
  };
  let orderScopedBalanceQueryService: {
    getAvailableBalancesForPair: jest.Mock;
    resolveInventoryRatio: jest.Mock;
  };

  beforeEach(() => {
    strategyRepo = createStrategyRepo();
    exchangeConnectorAdapterService = {
      cancelOrder: jest.fn().mockResolvedValue({ status: 'cancelled' }),
      fetchBalance: jest.fn().mockResolvedValue({
        free: { BTC: 10, USDT: 100000 },
      }),
      fetchOpenOrders: jest.fn().mockResolvedValue([]),
      fetchOrder: jest.fn().mockResolvedValue(null),
      loadTradingRules: jest.fn().mockResolvedValue({
        amountMin: 0.001,
        amountStep: 0.001,
        costMin: 10,
        priceStep: 0.01,
        makerFee: 0.001,
      }),
      quantizeOrder: jest.fn(
        (_exchange: string, _pair: string, qty: string, price: string) => ({
          qty,
          price,
        }),
      ),
    };
    exchangeOrderMappingService = {
      findByClientOrderId: jest.fn().mockResolvedValue(null),
      findByExchangeOrderId: jest.fn().mockResolvedValue(null),
    };
    strategyIntentStoreService = {
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
    executorOrchestratorService = {
      dispatchActions: jest.fn(async (_strategyKey: string, actions: any[]) =>
        actions.map((action) => ({
          ...action,
          status: action.status || 'NEW',
        })),
      ),
    };
    strategyMarketDataProviderService = {
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
      getAdaptivePmmSignalSnapshot: jest.fn().mockReturnValue({
        freshness: {
          status: 'fresh',
          ageMs: 0,
          staleSoftMs: 2000,
          staleHardMs: 10000,
        },
        crash: {
          crashed: false,
          changeBps: null,
          windowMs: 60000,
          thresholdBps: null,
        },
        unavailableReasons: [],
        midPriceHistory: [],
        realizedVolatility: null,
        imbalance: null,
        imbalanceDepthNotional: null,
      }),
    };
    executorRegistry = new ExecutorRegistry();
    exchangeOrderTrackerService = new ExchangeOrderTrackerService();
    runtimeObservationService = {
      getPressure: jest.fn().mockReturnValue({
        strategyKey: '',
        windowMs: 60_000,
        rejectCount: 0,
        postOnlyRejectCount: 0,
        rateLimitCount: 0,
      }),
    };
    pmmMarkoutEvaluatorService = {
      evaluateDue: jest.fn(),
      getToxicity: jest.fn().mockReturnValue(null),
    };
    orderScopedBalanceQueryService = {
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
        markets: {
          'BTC/USDT': {
            maker: 0.001,
          },
        },
      }),
      onExchangeReady: jest.fn().mockReturnValue(jest.fn()),
    } as any;
    strategySessionRegistryService = new StrategySessionRegistryService(
      exchangeInitService,
      executorRegistry,
    );
    const quotePlannerService = new QuotePlannerService(
      exchangeConnectorAdapterService as any,
    );
    const killSwitchService = {
      evaluatePureMarketMaking: jest.fn((session: any, params: any) => {
        if (
          Number(params.killSwitchThreshold || 0) > 0 &&
          Number(session?.realizedPnlQuote || 0) < 0
        ) {
          return { triggered: true, reason: 'loss_limit' };
        }

        return { triggered: false };
      }),
    };
    pureMarketMakingController = new PureMarketMakingStrategyController(
      new QuoteExecutorManagerService(),
      exchangeOrderTrackerService,
      strategyMarketDataProviderService as unknown as StrategyMarketDataProviderService,
      strategyIntentStoreService as any,
      pmmMarkoutEvaluatorService as any,
      runtimeObservationService as any,
      new AdaptivePmmStateService(
        quotePlannerService,
        undefined,
        runtimeObservationService as any,
      ),
      orderScopedBalanceQueryService as any,
      quotePlannerService,
      undefined,
      killSwitchService as any,
      strategySessionRegistryService,
    );
    const trackedOrderShutdownService = {
      cancelTrackedOrdersForStrategy: jest.fn(async (strategyKey: string) => {
        for (const order of exchangeOrderTrackerService.getOpenOrders(
          strategyKey,
        )) {
          await exchangeConnectorAdapterService.cancelOrder(
            order.exchange,
            order.pair,
            order.exchangeOrderId,
            order.accountLabel,
          );
        }
      }),
      forceTrackedOrdersTerminal: jest.fn(),
    };
    const strategyStartupRecoveryService = {
      restoreRuntimeStateForStrategy: jest.fn(async (strategy: any) => {
        const orders = await exchangeConnectorAdapterService.fetchOpenOrders(
          strategy.parameters.exchangeName,
          strategy.parameters.pair,
          strategy.parameters.accountLabel,
        );

        for (const order of orders) {
          if (
            order.id === 'ex-orphan' ||
            (order.clientOrderId &&
              (await exchangeOrderMappingService.findByClientOrderId(
                order.clientOrderId,
              )))
          ) {
            await exchangeConnectorAdapterService.cancelOrder(
              strategy.parameters.exchangeName,
              strategy.parameters.pair,
              order.id,
              strategy.parameters.accountLabel,
            );
          }
        }

        return { success: true, blockedReasons: [] };
      }),
    };
    const strategyInstanceLifecycleService =
      new StrategyInstanceLifecycleService(
        exchangeInitService,
        strategyRepo as any,
        undefined,
        strategyMarketDataProviderService as unknown as StrategyMarketDataProviderService,
        strategyIntentStoreService as any,
        trackedOrderShutdownService as any,
        strategySessionRegistryService,
        undefined,
        undefined,
        undefined,
        strategyStartupRecoveryService as any,
        exchangeOrderTrackerService,
      );

    strategyService = new StrategyService(
      exchangeInitService,
      strategyRepo as any,
      undefined,
      new StrategyControllerRegistry([pureMarketMakingController]),
      executorOrchestratorService as any,
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
  });

  const buildPureMarketMakingActions = (
    strategyKey: string,
    params: any,
    ts: string,
  ) =>
    pureMarketMakingController.buildPureMarketMakingActions(
      strategyKey,
      params,
      ts,
      {
        getSession: (key) => strategySessionRegistryService.sessions.get(key),
        setSession: (key, session) =>
          strategySessionRegistryService.sessions.set(key, session),
        getConnectorHealthStatus: (exchange) =>
          strategySessionRegistryService.getConnectorHealthStatus(exchange),
        setConnectorHealthStatus: (exchange, status) =>
          strategySessionRegistryService.setConnectorHealthStatus(
            exchange,
            status,
          ),
        logger: {
          marketMaking: () => ({
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          }),
        } as any,
      },
    );

  it('restores active quotes on startup, cancels orphan exchange orders, and avoids duplicate quotes on the next tick', async () => {
    const params = createPureMmParams('order-1');
    const strategy = {
      id: 1,
      strategyKey: 'order-1-pureMarketMaking',
      userId: params.userId,
      clientId: params.clientId,
      marketMakingOrderId: params.marketMakingOrderId,
      strategyType: 'pureMarketMaking',
      parameters: params,
      status: 'running',
      startPrice: 100,
      createdAt: getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
      contributions: [],
    } as unknown as StrategyInstance;

    strategyRepo.state.push(strategy);
    const trackedBuy: TrackedOrder = {
      orderId: 'order-1',
      strategyKey: strategy.strategyKey,
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-buy',
      clientOrderId: 'mm-buy',
      side: 'buy',
      price: '99',
      qty: '1',
      cumulativeFilledQty: '0',
      status: 'open',
      createdAt: getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
    };
    const trackedSell: TrackedOrder = {
      ...trackedBuy,
      exchangeOrderId: 'ex-sell',
      clientOrderId: 'mm-sell',
      side: 'sell',
      price: '101',
    };

    exchangeOrderTrackerService.upsertOrder(trackedBuy);
    exchangeOrderTrackerService.upsertOrder(trackedSell);
    exchangeConnectorAdapterService.fetchOpenOrders.mockResolvedValue([
      {
        id: 'ex-buy',
        clientOrderId: 'mm-buy',
        status: 'open',
        side: 'buy',
        price: '99',
        amount: '1',
        filled: '0',
      },
      {
        id: 'ex-sell',
        clientOrderId: 'mm-sell',
        status: 'open',
        side: 'sell',
        price: '101',
        amount: '1',
        filled: '0',
      },
      {
        id: 'ex-orphan',
        clientOrderId: 'mm-orphan',
        status: 'open',
        side: 'sell',
        price: '102',
        amount: '1',
        filled: '0',
      },
    ]);
    exchangeOrderMappingService.findByClientOrderId.mockImplementation(
      async (clientOrderId: string) =>
        clientOrderId === 'mm-orphan' ? { orderId: 'order-1' } : null,
    );

    await strategyService.start();

    const executor = executorRegistry.getExecutor('binance', 'BTC/USDT');

    expect(executor).toBeDefined();
    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'ex-orphan',
      undefined,
    );

    executorOrchestratorService.dispatchActions.mockClear();
    await executor!.onTick(getRFC3339Timestamp());

    expect(executorOrchestratorService.dispatchActions).toHaveBeenCalledWith(
      strategy.strategyKey,
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CANCEL_ORDER',
          mixinOrderId: 'ex-buy',
        }),
        expect.objectContaining({
          type: 'CANCEL_ORDER',
          mixinOrderId: 'ex-sell',
        }),
      ]),
    );
    expect(
      exchangeOrderTrackerService.getOpenOrders(strategy.strategyKey),
    ).toHaveLength(2);
  });

  it('cancels tracked exchange orders during shutdown and clears active executors', async () => {
    const params = createPureMmParams('order-2');

    await strategyService.executePureMarketMakingStrategy(params);
    exchangeOrderTrackerService.upsertOrder({
      orderId: 'order-2',
      strategyKey: 'order-2-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-2',
      side: 'buy',
      price: '99',
      qty: '1',
      status: 'open',
      createdAt: getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
    });

    await strategyService.onApplicationShutdown('SIGTERM');

    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'ex-2',
      undefined,
    );
    expect(executorRegistry.getExecutor('binance', 'BTC/USDT')).toBeUndefined();
  });

  it('pauses ticks while disconnected and resumes once connector health is restored', async () => {
    const params = {
      ...createPureMmParams('order-3'),
      hangingOrdersEnabled: false,
    };

    await strategyService.executePureMarketMakingStrategy(params);

    const executor = executorRegistry.getExecutor('binance', 'BTC/USDT');

    strategySessionRegistryService.setConnectorHealthStatus(
      'binance',
      'DISCONNECTED',
    );
    await executor!.onTick(getRFC3339Timestamp());

    expect(executorOrchestratorService.dispatchActions).not.toHaveBeenCalled();

    strategySessionRegistryService.setConnectorHealthStatus(
      'binance',
      'CONNECTED',
    );
    executor.getSession('order-3')!.nextRunAtMs = 0;
    await executor!.onTick(getRFC3339Timestamp());

    expect(executorOrchestratorService.dispatchActions).toHaveBeenCalled();
  });

  it('triggers the kill switch through the runtime tick and cancels managed orders', async () => {
    const params = {
      ...createPureMmParams('order-4'),
      killSwitchThreshold: 10,
    };

    await strategyService.executePureMarketMakingStrategy(params);
    exchangeOrderTrackerService.upsertOrder({
      orderId: 'order-4',
      strategyKey: 'order-4-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-4',
      side: 'buy',
      price: '99',
      qty: '1',
      status: 'open',
      createdAt: getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
    });

    const executor = executorRegistry.getExecutor('binance', 'BTC/USDT')!;
    const session = executor.getSession('order-4')!;

    session.realizedPnlQuote = -20;
    session.tradedQuoteVolume = 100;

    await executor.onTick(getRFC3339Timestamp());

    expect(executorOrchestratorService.dispatchActions).toHaveBeenCalledWith(
      'order-4-pureMarketMaking',
      [
        expect.objectContaining({
          type: 'STOP_CONTROLLER',
          metadata: { reason: 'loss_limit' },
        }),
      ],
    );
  });

  it('blocks adaptive PMM creates and emits cancels when tracked market data is stale', async () => {
    const params = {
      ...createPureMmParams('order-adaptive-stale'),
      volBasedSpread: true,
      staleSoftMs: 2000,
      staleHardMs: 10000,
    };
    const strategyKey = createPureMarketMakingStrategyKey(
      params.marketMakingOrderId,
    );

    exchangeOrderTrackerService.upsertOrder({
      orderId: params.marketMakingOrderId,
      strategyKey,
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-stale-buy',
      side: 'buy',
      price: '99',
      qty: '1',
      status: 'open',
      createdAt: getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
    });
    strategyMarketDataProviderService.getAdaptivePmmSignalSnapshot.mockReturnValue(
      {
        freshness: {
          status: 'soft_stale',
          ageMs: 3000,
          staleSoftMs: 2000,
          staleHardMs: 10000,
        },
        crash: {
          crashed: false,
          changeBps: null,
          windowMs: 60000,
          thresholdBps: null,
        },
        unavailableReasons: ['soft_stale_order_book'],
        midPriceHistory: [],
        realizedVolatility: null,
        imbalance: null,
        imbalanceDepthNotional: null,
      },
    );

    const actions = await buildPureMarketMakingActions(
      strategyKey,
      params,
      getRFC3339Timestamp(),
    );

    expect(actions).toEqual([
      expect.objectContaining({
        type: 'CANCEL_ORDER',
        mixinOrderId: 'ex-stale-buy',
      }),
    ]);
  });

  it('widens spread and reduces size from adaptive volatility signals', async () => {
    const params = {
      ...createPureMmParams('order-adaptive-vol'),
      orderAmount: 10,
      volBasedSpread: true,
      spreadSigmaMultiplier: 2,
      adaptiveSizeEnabled: true,
      sizeVolScalingFactor: 10,
      sizeFloor: 0.2,
      volatilitySampleMinCount: 3,
    };
    const strategyKey = createPureMarketMakingStrategyKey(
      params.marketMakingOrderId,
    );

    strategyMarketDataProviderService.getAdaptivePmmSignalSnapshot.mockReturnValue(
      {
        freshness: {
          status: 'fresh',
          ageMs: 0,
          staleSoftMs: 2000,
          staleHardMs: 10000,
        },
        crash: {
          crashed: false,
          changeBps: null,
          windowMs: 60000,
          thresholdBps: null,
        },
        unavailableReasons: [],
        midPriceHistory: [
          { price: 100, ts: 1, sequence: 1 },
          { price: 101, ts: 2, sequence: 2 },
          { price: 102, ts: 3, sequence: 3 },
        ],
        realizedVolatility: 0.02,
        imbalance: null,
        imbalanceDepthNotional: null,
      },
    );

    const actions = await buildPureMarketMakingActions(
      strategyKey,
      params,
      getRFC3339Timestamp(),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CREATE_LIMIT_ORDER',
          side: 'buy',
          price: '95',
          qty: '8',
        }),
        expect.objectContaining({
          type: 'CREATE_LIMIT_ORDER',
          side: 'sell',
          price: '105',
          qty: '8',
        }),
      ]),
    );
  });

  it('suppresses only the toxic side while markout cooldown is active', async () => {
    const params = {
      ...createPureMmParams('order-toxic-buy'),
      adverseMarkoutGuardBps: 50,
    };
    const strategyKey = createPureMarketMakingStrategyKey(
      params.marketMakingOrderId,
    );

    pmmMarkoutEvaluatorService.getToxicity.mockReturnValue({
      buyScore: 1,
      sellScore: 0,
      buyPausedUntilMs: Date.now() + 30_000,
      sellPausedUntilMs: null,
      buyLastPausedUntilMs: null,
      sellLastPausedUntilMs: null,
    });

    const actions = await buildPureMarketMakingActions(
      strategyKey,
      params,
      getRFC3339Timestamp(),
    );

    expect(actions).toEqual([
      expect.objectContaining({
        type: 'CREATE_LIMIT_ORDER',
        side: 'sell',
      }),
    ]);
  });

  it('widens PMM spread from recent runtime reject pressure', async () => {
    const params = {
      ...createPureMmParams('order-runtime-pressure'),
      postOnlyRejectThreshold: 2,
      postOnlyRejectWidenBps: 10,
    };
    const strategyKey = createPureMarketMakingStrategyKey(
      params.marketMakingOrderId,
    );

    runtimeObservationService.getPressure.mockReturnValue({
      strategyKey,
      windowMs: 60_000,
      rejectCount: 2,
      postOnlyRejectCount: 2,
      rateLimitCount: 0,
    });

    const actions = await buildPureMarketMakingActions(
      strategyKey,
      params,
      getRFC3339Timestamp(),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CREATE_LIMIT_ORDER',
          side: 'buy',
          price: '98.9',
        }),
        expect.objectContaining({
          type: 'CREATE_LIMIT_ORDER',
          side: 'sell',
          price: '101.1',
        }),
      ]),
    );
  });

  it('moves PMM quotes asymmetrically from positive order-book imbalance', async () => {
    const params = {
      ...createPureMmParams('order-imbalance-up'),
      imbalanceSkewFactor: 0.01,
      imbalanceDepthLevels: 3,
    };
    const strategyKey = createPureMarketMakingStrategyKey(
      params.marketMakingOrderId,
    );

    strategyMarketDataProviderService.getAdaptivePmmSignalSnapshot.mockReturnValue(
      {
        freshness: {
          status: 'fresh',
          ageMs: 0,
          staleSoftMs: 2000,
          staleHardMs: 10000,
        },
        crash: {
          crashed: false,
          changeBps: null,
          windowMs: 60000,
          thresholdBps: null,
        },
        unavailableReasons: [],
        midPriceHistory: [],
        realizedVolatility: null,
        imbalance: 0.5,
        imbalanceDepthNotional: 100000,
      },
    );

    const actions = await buildPureMarketMakingActions(
      strategyKey,
      params,
      getRFC3339Timestamp(),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CREATE_LIMIT_ORDER',
          side: 'buy',
          price: '98.5',
        }),
        expect.objectContaining({
          type: 'CREATE_LIMIT_ORDER',
          side: 'sell',
          price: '100.5',
        }),
      ]),
    );
  });

  it('suppresses imbalance skew when inventory deviation is severe', async () => {
    const params = {
      ...createPureMmParams('order-inventory-suppression'),
      currentBaseRatio: 0.8,
      inventoryTargetBaseRatio: 0.5,
      imbalanceSkewFactor: 0.01,
      inventorySeverePivot: 0.3,
    };
    const strategyKey = createPureMarketMakingStrategyKey(
      params.marketMakingOrderId,
    );

    strategyMarketDataProviderService.getAdaptivePmmSignalSnapshot.mockReturnValue(
      {
        freshness: {
          status: 'fresh',
          ageMs: 0,
          staleSoftMs: 2000,
          staleHardMs: 10000,
        },
        crash: {
          crashed: false,
          changeBps: null,
          windowMs: 60000,
          thresholdBps: null,
        },
        unavailableReasons: [],
        midPriceHistory: [],
        realizedVolatility: null,
        imbalance: 0.5,
        imbalanceDepthNotional: 100000,
      },
    );

    const actions = await buildPureMarketMakingActions(
      strategyKey,
      params,
      getRFC3339Timestamp(),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CREATE_LIMIT_ORDER',
          side: 'buy',
          price: '98.875',
        }),
        expect.objectContaining({
          type: 'CREATE_LIMIT_ORDER',
          side: 'sell',
          price: '100.875',
        }),
      ]),
    );
  });

  it('uses conservative warmup quotes while adaptive signal history is thin', async () => {
    const params = {
      ...createPureMmParams('order-warmup'),
      orderAmount: 10,
      numberOfLayers: 3,
      volBasedSpread: true,
      warmupSpread: 0.05,
      warmupSizeRatio: 0.2,
    };
    const strategyKey = createPureMarketMakingStrategyKey(
      params.marketMakingOrderId,
    );

    strategyMarketDataProviderService.getAdaptivePmmSignalSnapshot.mockReturnValue(
      {
        freshness: {
          status: 'fresh',
          ageMs: 0,
          staleSoftMs: 2000,
          staleHardMs: 10000,
        },
        crash: {
          crashed: false,
          changeBps: null,
          windowMs: 60000,
          thresholdBps: null,
        },
        unavailableReasons: [],
        midPriceHistory: [{ price: 100, ts: 1, sequence: 1 }],
        realizedVolatility: 0.02,
        imbalance: 0.5,
        imbalanceDepthNotional: 100000,
      },
    );

    const actions = await buildPureMarketMakingActions(
      strategyKey,
      params,
      getRFC3339Timestamp(),
    );

    expect(actions).toEqual([
      expect.objectContaining({
        type: 'CREATE_LIMIT_ORDER',
        slotKey: 'layer-1-buy',
        price: '95',
        qty: '2',
      }),
      expect.objectContaining({
        type: 'CREATE_LIMIT_ORDER',
        slotKey: 'layer-1-sell',
        price: '105',
        qty: '2',
      }),
    ]);
  });

  it('forces single-layer PMM when side budgets are too small for layered quoting', async () => {
    const params = {
      ...createPureMmParams('order-small-budget'),
      orderAmount: 0.11,
      numberOfLayers: 3,
      adaptiveSizeEnabled: true,
      layeringMinBudgetMultiple: 10,
    };
    const strategyKey = createPureMarketMakingStrategyKey(
      params.marketMakingOrderId,
    );
    orderScopedBalanceQueryService.getAvailableBalancesForPair.mockResolvedValue(
      {
        base: new BigNumber('0.5'),
        quote: new BigNumber('50'),
        assets: { base: 'BTC', quote: 'USDT' },
      },
    );

    const actions = await buildPureMarketMakingActions(
      strategyKey,
      params,
      getRFC3339Timestamp(),
    );

    expect(actions.map((action) => action.slotKey)).toEqual([
      'layer-1-buy',
      'layer-1-sell',
    ]);
  });

  it('runs a logical 30-minute adaptive scenario soak without action storms or unsafe stale creates', async () => {
    const params = {
      ...createPureMmParams('order-adaptive-soak'),
      orderAmount: 1,
      volBasedSpread: true,
      spreadSigmaMultiplier: 2,
      adaptiveSizeEnabled: true,
      sizeVolScalingFactor: 5,
      imbalanceSkewFactor: 0.01,
      postOnlyRejectThreshold: 1,
      postOnlyRejectWidenBps: 10,
      cancelBudgetPerSec: 2,
      volatilitySampleMinCount: 3,
      inventorySeverePivot: 0.3,
    };
    const strategyKey = createPureMarketMakingStrategyKey(
      params.marketMakingOrderId,
    );
    let currentToxicity: any = null;
    let currentPressure = {
      strategyKey,
      windowMs: 60_000,
      rejectCount: 0,
      postOnlyRejectCount: 0,
      rateLimitCount: 0,
    };
    const scenarios = [
      {
        name: 'calm-daily',
        params: {},
        freshness: {
          status: 'fresh',
          ageMs: 0,
          staleSoftMs: 2000,
          staleHardMs: 10000,
        },
        crash: {
          crashed: false,
          changeBps: null,
          windowMs: 60000,
          thresholdBps: null,
        },
        unavailableReasons: [],
        midPriceHistory: [
          { price: 100, ts: 1, sequence: 1 },
          { price: 100.01, ts: 2, sequence: 2 },
          { price: 100, ts: 3, sequence: 3 },
        ],
        realizedVolatility: 0.0001,
        imbalance: 0,
        imbalanceDepthNotional: 100000,
        toxicity: null,
        pressure: {
          strategyKey,
          windowMs: 60_000,
          rejectCount: 0,
          postOnlyRejectCount: 0,
          rateLimitCount: 0,
        },
      },
      {
        name: 'one-way-up-inventory-wins',
        params: {
          currentBaseRatio: 0.2,
          inventoryTargetBaseRatio: 0.5,
        },
        freshness: {
          status: 'fresh',
          ageMs: 0,
          staleSoftMs: 2000,
          staleHardMs: 10000,
        },
        crash: {
          crashed: false,
          changeBps: null,
          windowMs: 60000,
          thresholdBps: null,
        },
        unavailableReasons: [],
        midPriceHistory: [
          { price: 100, ts: 1, sequence: 1 },
          { price: 101, ts: 2, sequence: 2 },
          { price: 102, ts: 3, sequence: 3 },
        ],
        realizedVolatility: 0.01,
        imbalance: 0.6,
        imbalanceDepthNotional: 100000,
        toxicity: null,
        pressure: {
          strategyKey,
          windowMs: 60_000,
          rejectCount: 0,
          postOnlyRejectCount: 0,
          rateLimitCount: 0,
        },
      },
      {
        name: 'noisy-sideways',
        params: {},
        freshness: {
          status: 'fresh',
          ageMs: 0,
          staleSoftMs: 2000,
          staleHardMs: 10000,
        },
        crash: {
          crashed: false,
          changeBps: null,
          windowMs: 60000,
          thresholdBps: null,
        },
        unavailableReasons: [],
        midPriceHistory: [
          { price: 100, ts: 1, sequence: 1 },
          { price: 99.8, ts: 2, sequence: 2 },
          { price: 100.2, ts: 3, sequence: 3 },
        ],
        realizedVolatility: 0.005,
        imbalance: -0.2,
        imbalanceDepthNotional: 100000,
        toxicity: null,
        pressure: {
          strategyKey,
          windowMs: 60_000,
          rejectCount: 1,
          postOnlyRejectCount: 1,
          rateLimitCount: 0,
        },
      },
      {
        name: 'toxic-flow',
        params: {},
        freshness: {
          status: 'fresh',
          ageMs: 0,
          staleSoftMs: 2000,
          staleHardMs: 10000,
        },
        crash: {
          crashed: false,
          changeBps: null,
          windowMs: 60000,
          thresholdBps: null,
        },
        unavailableReasons: [],
        midPriceHistory: [
          { price: 100, ts: 1, sequence: 1 },
          { price: 100.5, ts: 2, sequence: 2 },
          { price: 101, ts: 3, sequence: 3 },
        ],
        realizedVolatility: 0.005,
        imbalance: null,
        imbalanceDepthNotional: 100000,
        toxicity: {
          buyScore: 1,
          sellScore: 0,
          buyPausedUntilMs: Date.now() + 30_000,
          sellPausedUntilMs: null,
          buyLastPausedUntilMs: null,
          sellLastPausedUntilMs: null,
        },
        pressure: {
          strategyKey,
          windowMs: 60_000,
          rejectCount: 0,
          postOnlyRejectCount: 0,
          rateLimitCount: 0,
        },
      },
      {
        name: 'thin-book',
        params: {},
        freshness: {
          status: 'fresh',
          ageMs: 0,
          staleSoftMs: 2000,
          staleHardMs: 10000,
        },
        crash: {
          crashed: false,
          changeBps: null,
          windowMs: 60000,
          thresholdBps: null,
        },
        unavailableReasons: ['insufficient_imbalance_depth'],
        midPriceHistory: [
          { price: 100, ts: 1, sequence: 1 },
          { price: 100.1, ts: 2, sequence: 2 },
          { price: 100, ts: 3, sequence: 3 },
        ],
        realizedVolatility: 0.002,
        imbalance: null,
        imbalanceDepthNotional: 5,
        toxicity: null,
        pressure: {
          strategyKey,
          windowMs: 60_000,
          rejectCount: 0,
          postOnlyRejectCount: 0,
          rateLimitCount: 0,
        },
      },
      {
        name: 'high-vol-severe-inventory',
        params: {
          currentBaseRatio: 0.9,
          inventoryTargetBaseRatio: 0.5,
        },
        freshness: {
          status: 'fresh',
          ageMs: 0,
          staleSoftMs: 2000,
          staleHardMs: 10000,
        },
        crash: {
          crashed: false,
          changeBps: null,
          windowMs: 60000,
          thresholdBps: null,
        },
        unavailableReasons: [],
        midPriceHistory: [
          { price: 100, ts: 1, sequence: 1 },
          { price: 103, ts: 2, sequence: 2 },
          { price: 99, ts: 3, sequence: 3 },
        ],
        realizedVolatility: 0.03,
        imbalance: 0.8,
        imbalanceDepthNotional: 100000,
        toxicity: null,
        pressure: {
          strategyKey,
          windowMs: 60_000,
          rejectCount: 0,
          postOnlyRejectCount: 0,
          rateLimitCount: 0,
        },
      },
    ];

    exchangeOrderTrackerService.upsertOrder({
      orderId: params.marketMakingOrderId,
      strategyKey,
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'soak-live-buy',
      side: 'buy',
      price: '99',
      qty: '1',
      status: 'open',
      createdAt: getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
    });
    runtimeObservationService.getPressure.mockImplementation(
      () => currentPressure,
    );
    pmmMarkoutEvaluatorService.getToxicity.mockImplementation(
      () => currentToxicity,
    );

    for (let index = 0; index < 180; index += 1) {
      const scenario = scenarios[index % scenarios.length];
      const {
        params: scenarioParams,
        toxicity,
        pressure,
        ...snapshot
      } = scenario;
      const second = index * 10;

      strategyMarketDataProviderService.getAdaptivePmmSignalSnapshot.mockReturnValue(
        snapshot,
      );
      currentToxicity = toxicity;
      currentPressure = pressure;

      const actions = await buildPureMarketMakingActions(
        strategyKey,
        {
          ...params,
          ...scenarioParams,
        },
        new Date(Date.UTC(2026, 2, 11, 0, 0, second)).toISOString(),
      );

      expect(scenario.name).toBeTruthy();
      expect(actions.length).toBeLessThanOrEqual(2);

      if (snapshot.freshness.status !== 'fresh') {
        expect(
          actions.every((action) => action.type !== 'CREATE_LIMIT_ORDER'),
        ).toBe(true);
      }
    }
  });
});
