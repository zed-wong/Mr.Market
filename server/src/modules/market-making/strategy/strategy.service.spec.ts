/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';

import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { ExchangeOrderMappingService } from '../execution/exchange-order-mapping.service';
import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { PerformanceService } from '../performance/performance.service';
import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';
import { PureMarketMakingStrategyDto } from './config/strategy.dto';
import { TimeIndicatorStrategyDto } from './config/timeIndicator.dto';
import { StrategyControllerRegistry } from './controllers/strategy-controller.registry';
import { StrategyMarketDataProviderService } from './data/strategy-market-data-provider.service';
import { ExecutorRegistry } from './execution/executor-registry';
import { StrategyIntentStoreService } from './execution/strategy-intent-store.service';
import { ExecutorOrchestratorService } from './intent/executor-orchestrator.service';
import { StrategyService } from './strategy.service';

class PerformanceServiceMock {
  recordPerformance = jest.fn();
}

class ExchangeInitServiceMock {
  private readonly readyListeners: Array<
    (exchangeName: string, accountLabel: string) => void | Promise<void>
  > = [];
  isReady = jest.fn().mockReturnValue(true);

  getExchange(exchangeName: string): any {
    return {
      id: exchangeName,
      name: exchangeName,
      fetchTicker: jest.fn().mockResolvedValue({ last: 100.5 }),
    };
  }

  getSupportedExchanges(): string[] {
    return ['bitfinex', 'mexc', 'binance'];
  }

  onExchangeReady(
    listener: (
      exchangeName: string,
      accountLabel: string,
    ) => void | Promise<void>,
  ): () => void {
    this.readyListeners.push(listener);

    return () => {
      const index = this.readyListeners.indexOf(listener);

      if (index >= 0) {
        this.readyListeners.splice(index, 1);
      }
    };
  }

  async emitReady(exchangeName: string, accountLabel: string): Promise<void> {
    for (const listener of this.readyListeners) {
      await listener(exchangeName, accountLabel);
    }
  }
}

describe('StrategyService', () => {
  let service: StrategyService;
  let executorRegistry: ExecutorRegistry;
  let exchangeInitService: ExchangeInitServiceMock;
  let executorOrchestratorService: {
    dispatchActions: jest.Mock;
  };
  let strategyIntentStoreService: {
    cancelPendingIntents: jest.Mock;
  };
  let balanceLedgerService: {
    adjust: jest.Mock;
  };
  let exchangeOrderTrackerService: {
    getOpenOrders: jest.Mock;
    getLiveOrders: jest.Mock;
    getActiveSlotOrders: jest.Mock;
    getTrackedOrders: jest.Mock;
    upsertOrder: jest.Mock;
  };
  let strategyMarketDataProviderService: {
    getReferencePrice: jest.Mock;
    getTrackedBestBidAsk: jest.Mock;
    getBestBidAsk: jest.Mock;
    getOrderBook: jest.Mock;
    hasTrackedOrderBook: jest.Mock;
  };
  let exchangeConnectorAdapterService: {
    loadTradingRules: jest.Mock;
    quantizeOrder: jest.Mock;
    fetchBalance: jest.Mock;
    cancelOrder: jest.Mock;
    fetchOpenOrders: jest.Mock;
    fetchOrder: jest.Mock;
  };
  let exchangeOrderMappingService: {
    findByClientOrderId: jest.Mock;
    findByExchangeOrderId: jest.Mock;
  };

  const mockStrategyInstanceRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const registerPooledSession = async ({
    strategyKey,
    strategyType,
    userId,
    clientId,
    cadenceMs,
    params,
    marketMakingOrderId,
    nextRunAtMs,
    runId,
  }: {
    strategyKey: string;
    strategyType:
      | 'pureMarketMaking'
      | 'dualAccountVolume'
      | 'volume'
      | 'timeIndicator';
    userId: string;
    clientId: string;
    cadenceMs: number;
    params: Record<string, any>;
    marketMakingOrderId?: string;
    nextRunAtMs?: number;
    runId?: string;
  }) =>
    await (service as any).upsertSession(
      strategyKey,
      strategyType,
      userId,
      clientId,
      cadenceMs,
      params,
      marketMakingOrderId,
      nextRunAtMs,
      runId,
    );

  beforeEach(async () => {
    executorOrchestratorService = {
      dispatchActions: jest.fn(async (_strategyKey: string, actions: any[]) =>
        actions.map((action: any) => ({
          ...action,
          status: action.status || 'NEW',
        })),
      ),
    };
    balanceLedgerService = {
      adjust: jest.fn().mockResolvedValue({ applied: true }),
    };
    exchangeOrderTrackerService = {
      getOpenOrders: jest.fn().mockReturnValue([]),
      getLiveOrders: jest.fn().mockReturnValue([]),
      getActiveSlotOrders: jest.fn().mockReturnValue([]),
      getTrackedOrders: jest.fn().mockReturnValue([]),
      upsertOrder: jest.fn(),
    };
    strategyIntentStoreService = {
      cancelPendingIntents: jest.fn().mockResolvedValue(0),
    };
    strategyMarketDataProviderService = {
      getReferencePrice: jest.fn().mockResolvedValue(100.5),
      getTrackedBestBidAsk: jest
        .fn()
        .mockReturnValue({ bestBid: 100, bestAsk: 101 }),
      getBestBidAsk: jest
        .fn()
        .mockResolvedValue({ bestBid: 100, bestAsk: 101 }),
      getOrderBook: jest.fn().mockResolvedValue({
        bids: [[100, 10]],
        asks: [[101, 10]],
      }),
      hasTrackedOrderBook: jest.fn().mockReturnValue(true),
    };
    exchangeConnectorAdapterService = {
      loadTradingRules: jest.fn().mockResolvedValue({
        amountMin: 0.001,
        costMin: 10,
        makerFee: 0.001,
      }),
      quantizeOrder: jest.fn(
        (_: string, __: string, qty: string, price: string) => ({
          qty,
          price,
        }),
      ),
      fetchBalance: jest.fn().mockResolvedValue({
        free: { BTC: 10, USDT: 1000 },
      }),
      cancelOrder: jest.fn().mockResolvedValue({ status: 'cancelled' }),
      fetchOpenOrders: jest.fn().mockResolvedValue([]),
      fetchOrder: jest.fn().mockResolvedValue(null),
    };
    exchangeOrderMappingService = {
      findByClientOrderId: jest.fn().mockResolvedValue(null),
      findByExchangeOrderId: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StrategyService,
        { provide: PerformanceService, useClass: PerformanceServiceMock },
        { provide: ExchangeInitService, useClass: ExchangeInitServiceMock },
        {
          provide: ExecutorOrchestratorService,
          useValue: executorOrchestratorService,
        },
        {
          provide: BalanceLedgerService,
          useValue: balanceLedgerService,
        },
        {
          provide: StrategyControllerRegistry,
          useValue: {
            getController: jest.fn().mockReturnValue(undefined),
            listControllerTypes: jest
              .fn()
              .mockReturnValue(['arbitrage', 'pureMarketMaking', 'volume']),
          },
        },
        {
          provide: StrategyMarketDataProviderService,
          useValue: strategyMarketDataProviderService,
        },
        {
          provide: StrategyIntentStoreService,
          useValue: strategyIntentStoreService,
        },
        {
          provide: ExchangeOrderTrackerService,
          useValue: exchangeOrderTrackerService,
        },
        {
          provide: ExchangeConnectorAdapterService,
          useValue: exchangeConnectorAdapterService,
        },
        {
          provide: ExchangeOrderMappingService,
          useValue: exchangeOrderMappingService,
        },
        ExecutorRegistry,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: getRepositoryToken(StrategyInstance),
          useValue: mockStrategyInstanceRepository,
        },
      ],
    }).compile();

    service = module.get<StrategyService>(StrategyService);
    executorRegistry = module.get<ExecutorRegistry>(ExecutorRegistry);
    exchangeInitService = module.get<ExchangeInitServiceMock>(
      ExchangeInitService as any,
    );
    await service.onModuleInit();

    jest.clearAllMocks();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('registers a pure market making session without executing orders directly', async () => {
    const strategyParamsDto: PureMarketMakingStrategyDto = {
      userId: '1',
      clientId: 'client1',
      pair: 'BTC/USDT',
      exchangeName: 'bitfinex',
      bidSpread: 0.1,
      askSpread: 0.1,
      orderAmount: 1,
      orderRefreshTime: 1000,
      numberOfLayers: 2,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0.1,
      amountChangeType: 'percentage',
      ceilingPrice: undefined,
      floorPrice: undefined,
    };

    await service.executePureMarketMakingStrategy(strategyParamsDto);
    await service.executeMMCycle(strategyParamsDto);
  });

  it('restores tracked PMM orders and cancels orphan exchange orders on startup', async () => {
    const strategy = {
      strategyKey: 'order-1-pureMarketMaking',
      strategyType: 'pureMarketMaking',
      userId: 'user-1',
      clientId: 'order-1',
      marketMakingOrderId: 'order-1',
      parameters: {
        userId: 'user-1',
        clientId: 'order-1',
        marketMakingOrderId: 'order-1',
        pair: 'BTC/USDT',
        exchangeName: 'binance',
        bidSpread: 0.01,
        askSpread: 0.01,
        orderAmount: 1,
        orderRefreshTime: 1000,
        numberOfLayers: 1,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
      },
    };

    mockStrategyInstanceRepository.find.mockResolvedValue([strategy]);
    exchangeOrderTrackerService.getTrackedOrders.mockReturnValue([
      {
        orderId: 'order-1',
        strategyKey: strategy.strategyKey,
        exchange: 'binance',
        pair: 'BTC/USDT',
        exchangeOrderId: 'ex-known',
        clientOrderId: 'mm-known',
        side: 'buy',
        price: '99',
        qty: '1',
        cumulativeFilledQty: '0',
        status: 'pending_create',
        createdAt: '2026-04-09T00:00:00.000Z',
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
    ]);
    exchangeConnectorAdapterService.fetchOpenOrders.mockResolvedValue([
      {
        id: 'ex-known',
        clientOrderId: 'mm-known',
        status: 'open',
        side: 'buy',
        price: '99',
        amount: '1',
        filled: '0',
      },
      {
        id: 'ex-orphan',
        clientOrderId: 'mm-orphan',
        status: 'open',
        side: 'sell',
        price: '101',
        amount: '1',
        filled: '0',
      },
    ]);
    exchangeOrderMappingService.findByClientOrderId.mockImplementation(
      async (clientOrderId: string) =>
        clientOrderId === 'mm-orphan' ? { orderId: 'order-1' } : null,
    );
    jest.spyOn(service, 'getCadenceMs').mockReturnValue(1000);
    jest.spyOn(service as any, 'upsertSession').mockResolvedValue({
      strategyKey: strategy.strategyKey,
    });

    await service.start();

    expect(
      exchangeConnectorAdapterService.fetchOpenOrders,
    ).toHaveBeenCalledWith('binance', 'BTC/USDT', undefined);
    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'ex-orphan',
      undefined,
    );
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'ex-known',
        status: 'open',
      }),
    );
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'ex-orphan',
        status: 'cancelled',
      }),
    );
  });

  it('registers pure market making runtime in pooled executor registry', async () => {
    const strategyParamsDto: PureMarketMakingStrategyDto = {
      userId: '1',
      clientId: 'client1',
      pair: 'BTC/USDT',
      exchangeName: 'bitfinex',
      bidSpread: 0.1,
      askSpread: 0.1,
      orderAmount: 1,
      orderRefreshTime: 1000,
      numberOfLayers: 2,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0.1,
      amountChangeType: 'percentage',
      ceilingPrice: undefined,
      floorPrice: undefined,
    };

    await service.executePureMarketMakingStrategy(strategyParamsDto);

    const executor = executorRegistry.getExecutor('bitfinex', 'BTC/USDT');

    expect(executor).toBeDefined();
    expect(executor?.getSession('client1')).toEqual(
      expect.objectContaining({
        strategyKey: 'client1-pureMarketMaking',
        clientId: 'client1',
        marketMakingOrderId: 'client1',
      }),
    );
  });

  it('routes fills to pooled executor by exchange and pair', async () => {
    const strategyParamsDto: PureMarketMakingStrategyDto = {
      userId: '1',
      clientId: 'client1',
      pair: 'BTC/USDT',
      exchangeName: 'bitfinex',
      bidSpread: 0.1,
      askSpread: 0.1,
      orderAmount: 1,
      orderRefreshTime: 1000,
      numberOfLayers: 2,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0.1,
      amountChangeType: 'percentage',
      ceilingPrice: undefined,
      floorPrice: undefined,
    };

    await service.executePureMarketMakingStrategy(strategyParamsDto);

    const executor = executorRegistry.getExecutor('bitfinex', 'BTC/USDT');
    const onFill = jest.fn();

    executor?.configure({ onFill });

    await expect(
      service.routeFillForExchangePair('bitfinex', 'BTC/USDT', {
        orderId: 'client1',
        clientOrderId: 'client1:0',
      }),
    ).resolves.toBe(true);

    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyKey: 'client1-pureMarketMaking',
      }),
      expect.objectContaining({
        clientOrderId: 'client1:0',
      }),
    );
  });

  it('updates ledger balances when a pure market making fill is routed', async () => {
    const strategyParamsDto: PureMarketMakingStrategyDto = {
      userId: '1',
      clientId: 'client1',
      pair: 'BTC/USDT',
      exchangeName: 'bitfinex',
      bidSpread: 0.1,
      askSpread: 0.1,
      orderAmount: 1,
      orderRefreshTime: 1000,
      numberOfLayers: 2,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0.1,
      amountChangeType: 'percentage',
      ceilingPrice: undefined,
      floorPrice: undefined,
    };

    await service.executePureMarketMakingStrategy(strategyParamsDto);

    await expect(
      service.routeFillForExchangePair('bitfinex', 'BTC/USDT', {
        orderId: 'client1',
        clientOrderId: 'client1:0',
        exchangeOrderId: 'ex-1',
        side: 'buy',
        price: '100',
        qty: '0.5',
        receivedAt: '2026-03-18T00:00:00.000Z',
      }),
    ).resolves.toBe(true);

    expect(balanceLedgerService.adjust).toHaveBeenCalledTimes(2);
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(1, {
      userId: '1',
      assetId: 'BTC',
      amount: '0.5',
      idempotencyKey:
        'mm-fill:client1-pureMarketMaking:ex-1:client1:0:buy:100:0.5:base',
      refType: 'market_making_fill',
      refId: 'ex-1',
    });
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(2, {
      userId: '1',
      assetId: 'USDT',
      amount: '-50',
      idempotencyKey:
        'mm-fill:client1-pureMarketMaking:ex-1:client1:0:buy:100:0.5:quote',
      refType: 'market_making_fill',
      refId: 'ex-1',
    });
  });

  it('uses cumulative fill state instead of receivedAt in ledger idempotency keys', async () => {
    const strategyParamsDto: PureMarketMakingStrategyDto = {
      userId: '1',
      clientId: 'client1',
      pair: 'BTC/USDT',
      exchangeName: 'bitfinex',
      bidSpread: 0.1,
      askSpread: 0.1,
      orderAmount: 1,
      orderRefreshTime: 1000,
      numberOfLayers: 2,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0.1,
      amountChangeType: 'percentage',
      ceilingPrice: undefined,
      floorPrice: undefined,
    };

    await service.executePureMarketMakingStrategy(strategyParamsDto);

    await service.routeFillForExchangePair('bitfinex', 'BTC/USDT', {
      orderId: 'client1',
      clientOrderId: 'client1:0',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '0.5',
      cumulativeQty: '1.5',
      receivedAt: '2026-03-18T00:00:00.000Z',
    });

    await service.routeFillForExchangePair('bitfinex', 'BTC/USDT', {
      orderId: 'client1',
      clientOrderId: 'client1:0',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '0.5',
      cumulativeQty: '1.5',
      receivedAt: '2026-03-18T00:01:00.000Z',
    });

    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        idempotencyKey:
          'mm-fill:client1-pureMarketMaking:ex-1:client1:0:buy:100:1.5:base',
      }),
    );
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        idempotencyKey:
          'mm-fill:client1-pureMarketMaking:ex-1:client1:0:buy:100:1.5:base',
      }),
    );
  });

  it('prefers fillId over receivedAt when building ledger idempotency keys', async () => {
    const strategyParamsDto: PureMarketMakingStrategyDto = {
      userId: '1',
      clientId: 'client1',
      pair: 'BTC/USDT',
      exchangeName: 'bitfinex',
      bidSpread: 0.1,
      askSpread: 0.1,
      orderAmount: 1,
      orderRefreshTime: 1000,
      numberOfLayers: 2,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0.1,
      amountChangeType: 'percentage',
      ceilingPrice: undefined,
      floorPrice: undefined,
    };

    await service.executePureMarketMakingStrategy(strategyParamsDto);

    await service.routeFillForExchangePair('bitfinex', 'BTC/USDT', {
      orderId: 'client1',
      clientOrderId: 'client1:0',
      exchangeOrderId: 'ex-1',
      fillId: 'fill-123',
      side: 'buy',
      price: '100',
      qty: '0.5',
      cumulativeQty: '1.5',
      receivedAt: '2026-03-18T00:00:00.000Z',
    });

    await service.routeFillForExchangePair('bitfinex', 'BTC/USDT', {
      orderId: 'client1',
      clientOrderId: 'client1:0',
      exchangeOrderId: 'ex-1',
      fillId: 'fill-123',
      side: 'buy',
      price: '100',
      qty: '0.5',
      cumulativeQty: '99',
      receivedAt: '2026-03-18T00:01:00.000Z',
    });

    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        idempotencyKey: 'mm-fill:client1-pureMarketMaking:fill-123:base',
      }),
    );
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        idempotencyKey: 'mm-fill:client1-pureMarketMaking:fill-123:base',
      }),
    );
  });

  it('makes the filled session immediately eligible for the next tick', async () => {
    const nowMs = 1_700_000_000_000;

    jest.spyOn(Date, 'now').mockReturnValue(nowMs);

    await registerPooledSession({
      strategyKey: 'client1-pureMarketMaking',
      strategyType: 'pureMarketMaking',
      userId: '1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs + 60_000,
      params: {
        userId: '1',
        clientId: 'client1',
        pair: 'BTC/USDT',
        exchangeName: 'bitfinex',
      },
    });

    await service.routeFillForExchangePair('bitfinex', 'BTC/USDT', {
      orderId: 'client1',
      clientOrderId: 'client1:0',
      exchangeOrderId: 'ex-1',
      side: 'sell',
      price: '100',
      qty: '1',
      receivedAt: '2026-03-18T00:00:00.000Z',
    });

    const executor = executorRegistry.getExecutor('bitfinex', 'BTC/USDT');

    expect(executor?.getSession('client1')?.nextRunAtMs).toBe(nowMs);
  });

  it('publishes intents for a pure market making cycle', async () => {
    const strategyParamsDto: PureMarketMakingStrategyDto = {
      userId: '1',
      clientId: 'client1',
      pair: 'BTC/USDT',
      exchangeName: 'bitfinex',
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: 1,
      orderRefreshTime: 1000,
      numberOfLayers: 1,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      ceilingPrice: undefined,
      floorPrice: undefined,
    };

    await service.executeMMCycle(strategyParamsDto);

    const intents = service.getLatestIntentsForStrategy(
      'client1-pureMarketMaking',
    );

    expect(intents.length).toBe(2);
    expect(intents[0].type).toBe('CREATE_LIMIT_ORDER');
  });

  it('uses controller decideActions path for pure market making sessions', async () => {
    const nowMs = 1_700_000_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    const strategyKey = 'client1-pureMarketMaking';
    const buildActionsSpy = jest.spyOn(service, 'buildPureMarketMakingActions');

    (service as any).strategyControllerRegistry = {
      getController: jest.fn().mockReturnValue({
        decideActions: jest.fn(
          async (session: any, ts: string, svc: any) =>
            await svc.buildPureMarketMakingActions(
              session.strategyKey,
              session.params,
              ts,
            ),
        ),
      }),
    };

    await registerPooledSession({
      strategyKey,
      strategyType: 'pureMarketMaking',
      userId: '1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs,
      runId: 'run-1',
      marketMakingOrderId: 'client1',
      params: {
        userId: '1',
        clientId: 'client1',
        pair: 'BTC/USDT',
        exchangeName: 'bitfinex',
        bidSpread: 0.01,
        askSpread: 0.01,
        orderAmount: 1,
        orderRefreshTime: 1000,
        numberOfLayers: 1,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
      },
    });

    await service.onTick('2026-03-04T00:00:00.000Z');

    expect(buildActionsSpy).toHaveBeenCalledTimes(1);

    dateNowSpy.mockRestore();
  });

  it('publishes intents through orchestrator', async () => {
    const strategyParamsDto: PureMarketMakingStrategyDto = {
      userId: '1',
      clientId: 'client1',
      pair: 'BTC/USDT',
      exchangeName: 'bitfinex',
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: 1,
      orderRefreshTime: 1000,
      numberOfLayers: 1,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      ceilingPrice: undefined,
      floorPrice: undefined,
    };

    await service.executeMMCycle(strategyParamsDto);

    expect(executorOrchestratorService.dispatchActions).toHaveBeenCalledTimes(
      1,
    );
    expect(executorOrchestratorService.dispatchActions).toHaveBeenCalledWith(
      'client1-pureMarketMaking',
      expect.arrayContaining([
        expect.objectContaining({ type: 'CREATE_LIMIT_ORDER' }),
      ]),
    );
  });

  it('stops a strategy and emits a stop intent', async () => {
    const strategyParamsDto: PureMarketMakingStrategyDto = {
      userId: '1',
      clientId: 'client1',
      pair: 'BTC/USDT',
      exchangeName: 'bitfinex',
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: 1,
      orderRefreshTime: 1000,
      numberOfLayers: 1,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      ceilingPrice: undefined,
      floorPrice: undefined,
    };

    await service.executePureMarketMakingStrategy(strategyParamsDto);
    await service.stopStrategyForUser('1', 'client1', 'pureMarketMaking');

    expect(executorOrchestratorService.dispatchActions).toHaveBeenCalledWith(
      'client1-pureMarketMaking',
      expect.arrayContaining([
        expect.objectContaining({
          type: 'STOP_CONTROLLER',
          status: 'CANCELLED',
        }),
      ]),
    );
    expect(
      strategyIntentStoreService.cancelPendingIntents,
    ).toHaveBeenCalledWith(
      'client1-pureMarketMaking',
      'strategy stopped before intent execution',
    );

    const intents = service.getLatestIntentsForStrategy(
      'client1-pureMarketMaking',
    );

    expect(intents).toEqual([]);
  });

  it('cancels tracked orders for active sessions during application shutdown', async () => {
    (service as any).sessions.set('order-1-pureMarketMaking', {
      runId: 'run-1',
      strategyKey: 'order-1-pureMarketMaking',
      strategyType: 'pureMarketMaking',
      userId: 'user-1',
      clientId: 'order-1',
      marketMakingOrderId: 'order-1',
      cadenceMs: 1000,
      nextRunAtMs: 0,
      params: {
        exchangeName: 'binance',
        pair: 'BTC/USDT',
      },
    });
    exchangeOrderTrackerService.getTrackedOrders
      .mockReturnValueOnce([
        {
          orderId: 'order-1',
          strategyKey: 'order-1-pureMarketMaking',
          exchange: 'binance',
          pair: 'BTC/USDT',
          exchangeOrderId: 'ex-open',
          side: 'buy',
          price: '99',
          qty: '1',
          status: 'open',
          createdAt: '2026-04-09T00:00:00.000Z',
          updatedAt: '2026-04-09T00:00:00.000Z',
        },
      ])
      .mockReturnValue([]);

    await service.onApplicationShutdown('SIGTERM');

    expect(mockStrategyInstanceRepository.update).toHaveBeenCalledWith(
      { strategyKey: 'order-1-pureMarketMaking' },
      expect.objectContaining({ status: 'stopped' }),
    );
    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'ex-open',
      undefined,
    );
    expect(
      strategyIntentStoreService.cancelPendingIntents,
    ).toHaveBeenCalledWith(
      'order-1-pureMarketMaking',
      expect.stringContaining('SIGTERM'),
    );
  });

  it('removes pooled executor session when stopping a strategy', async () => {
    const strategyParamsDto: PureMarketMakingStrategyDto = {
      userId: '1',
      clientId: 'client1',
      pair: 'BTC/USDT',
      exchangeName: 'bitfinex',
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: 1,
      orderRefreshTime: 1000,
      numberOfLayers: 1,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      ceilingPrice: undefined,
      floorPrice: undefined,
    };

    await service.executePureMarketMakingStrategy(strategyParamsDto);
    await service.stopStrategyForUser('1', 'client1', 'pureMarketMaking');

    expect(
      executorRegistry.getExecutor('bitfinex', 'BTC/USDT'),
    ).toBeUndefined();
  });

  it('cancels tracked open orders during stop', async () => {
    const trackedOrder = {
      orderId: 'client1',
      strategyKey: 'client1-pureMarketMaking',
      exchange: 'bitfinex',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    exchangeOrderTrackerService.getOpenOrders.mockReturnValue([trackedOrder]);
    exchangeOrderTrackerService.getTrackedOrders
      .mockReturnValueOnce([trackedOrder])
      .mockReturnValue([]);

    await service.stopStrategyForUser('1', 'client1', 'pureMarketMaking');

    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'bitfinex',
      'BTC/USDT',
      'ex-1',
      undefined,
    );
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'ex-1',
        status: 'cancelled',
      }),
    );
  });

  it('falls back to ticker price when order book is empty', async () => {
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    const strategyParamsDto: PureMarketMakingStrategyDto = {
      userId: '1',
      clientId: 'client1',
      pair: 'BTC/USDT',
      exchangeName: 'bitfinex',
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: 1,
      orderRefreshTime: 1000,
      numberOfLayers: 1,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      ceilingPrice: undefined,
      floorPrice: undefined,
    };

    await expect(
      service.executeMMCycle(strategyParamsDto),
    ).resolves.not.toThrow();
    expect(
      service.getLatestIntentsForStrategy('client1-pureMarketMaking'),
    ).toHaveLength(2);
  });

  it('continues onTick when one session run fails', async () => {
    const nowMs = 1_700_000_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    const runSessionSpy = jest
      .spyOn(service as any, 'runSession')
      .mockImplementation(async (session: { strategyKey: string }) => {
        if (session.strategyKey === 'a-strategy') {
          throw new Error('boom');
        }
      });

    const loggerErrorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);

    await registerPooledSession({
      strategyKey: 'a-strategy',
      strategyType: 'pureMarketMaking',
      userId: 'u1',
      clientId: 'c1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs,
      params: {
        exchangeName: 'binance',
        pair: 'BTC/USDT',
      },
    });
    await registerPooledSession({
      strategyKey: 'b-strategy',
      strategyType: 'pureMarketMaking',
      userId: 'u2',
      clientId: 'c2',
      cadenceMs: 2000,
      nextRunAtMs: nowMs,
      params: {
        exchangeName: 'binance',
        pair: 'BTC/USDT',
      },
    });

    await expect(service.onTick('2026-02-27T00:00:00.000Z')).resolves.toBe(
      undefined,
    );

    expect(runSessionSpy).toHaveBeenCalledTimes(2);
    expect((runSessionSpy.mock.calls[0][0] as any).strategyKey).toBe(
      'a-strategy',
    );
    expect((runSessionSpy.mock.calls[1][0] as any).strategyKey).toBe(
      'b-strategy',
    );
    expect((service as any).sessions.get('a-strategy').nextRunAtMs).toBe(
      nowMs + 1000,
    );
    expect((service as any).sessions.get('b-strategy').nextRunAtMs).toBe(
      nowMs + 2000,
    );
    expect(loggerErrorSpy).toHaveBeenCalledTimes(1);

    dateNowSpy.mockRestore();
  });

  it('skips stale session snapshot when active runId has changed', async () => {
    const nowMs = 1_700_000_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    const runSessionSpy = jest
      .spyOn(service as any, 'runSession')
      .mockImplementation(async (session: { strategyKey: string }) => {
        if (session.strategyKey === 'a-strategy') {
          const executor = executorRegistry.getExecutor('binance', 'BTC/USDT');
          const nextB = await executor?.addOrder('c2', 'u2', {
            strategyKey: 'b-strategy',
            strategyType: 'pureMarketMaking',
            clientId: 'c2',
            marketMakingOrderId: 'c2',
            cadenceMs: 2000,
            nextRunAtMs: nowMs,
            runId: 'run-b-new',
            params: {
              exchangeName: 'binance',
              pair: 'BTC/USDT',
            },
          });

          if (nextB) {
            (service as any).sessions.set('b-strategy', nextB);
          }
        }
      });

    await registerPooledSession({
      strategyKey: 'a-strategy',
      strategyType: 'pureMarketMaking',
      userId: 'u1',
      clientId: 'c1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs,
      runId: 'run-a',
      marketMakingOrderId: 'c1',
      params: {
        exchangeName: 'binance',
        pair: 'BTC/USDT',
      },
    });
    await registerPooledSession({
      strategyKey: 'b-strategy',
      strategyType: 'pureMarketMaking',
      userId: 'u2',
      clientId: 'c2',
      cadenceMs: 2000,
      nextRunAtMs: nowMs,
      runId: 'run-b-old',
      marketMakingOrderId: 'c2',
      params: {
        exchangeName: 'binance',
        pair: 'BTC/USDT',
      },
    });

    await expect(service.onTick('2026-02-27T00:00:00.000Z')).resolves.toBe(
      undefined,
    );

    expect(runSessionSpy).toHaveBeenCalledTimes(1);
    expect((runSessionSpy.mock.calls[0][0] as any).strategyKey).toBe(
      'a-strategy',
    );

    dateNowSpy.mockRestore();
  });

  it('publishes cex volume intents before persisting strategy params', async () => {
    const nowMs = 1_700_000_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    const strategyKey = 'user1-client1-volume';
    const publishIntentsSpy = jest
      .spyOn(service as any, 'publishIntents')
      .mockResolvedValue(undefined);
    const persistStrategyParamsSpy = jest
      .spyOn(service as any, 'persistStrategyParams')
      .mockResolvedValue(undefined);

    jest.spyOn(service as any, 'buildVolumeActions').mockResolvedValue([
      {
        type: 'CREATE_LIMIT_ORDER',
        intentId: 'intent-1',
        strategyInstanceId: strategyKey,
        strategyKey,
        userId: 'user1',
        clientId: 'client1',
        exchange: 'binance',
        pair: 'BTC/USDT',
        side: 'buy',
        price: '100',
        qty: '1',
        createdAt: '2026-03-01T00:00:00.000Z',
        status: 'NEW',
      },
    ]);

    (service as any).strategyControllerRegistry = {
      getController: jest.fn().mockImplementation((strategyType: string) => {
        if (strategyType !== 'volume') {
          return undefined;
        }

        return {
          decideActions: jest.fn(
            async (session: any, ts: string, svc: any) =>
              await svc.buildVolumeSessionActions(session, ts),
          ),
          onActionsPublished: jest.fn(
            async (session: any, actions: any[], svc: any) =>
              await svc.onVolumeActionsPublished(session, actions),
          ),
        };
      }),
    };

    await registerPooledSession({
      strategyKey,
      strategyType: 'volume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs,
      runId: 'run-1',
      params: {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        postOnlySide: 'buy',
        executedTrades: 0,
      },
    });

    await expect(service.onTick('2026-03-01T00:00:00.000Z')).resolves.toBe(
      undefined,
    );

    expect(publishIntentsSpy).toHaveBeenCalledTimes(1);
    expect(persistStrategyParamsSpy).toHaveBeenCalledTimes(1);
    expect(publishIntentsSpy.mock.invocationCallOrder[0]).toBeLessThan(
      persistStrategyParamsSpy.mock.invocationCallOrder[0],
    );
    expect(
      (service as any).sessions.get(strategyKey).params.executedTrades,
    ).toBe(1);

    dateNowSpy.mockRestore();
  });

  it('does not persist cex volume params when publish intents fails', async () => {
    const nowMs = 1_700_000_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    const strategyKey = 'user1-client1-volume';
    const loggerErrorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
    const persistStrategyParamsSpy = jest
      .spyOn(service as any, 'persistStrategyParams')
      .mockResolvedValue(undefined);

    jest.spyOn(service as any, 'buildVolumeActions').mockResolvedValue([
      {
        type: 'CREATE_LIMIT_ORDER',
        intentId: 'intent-1',
        strategyInstanceId: strategyKey,
        strategyKey,
        userId: 'user1',
        clientId: 'client1',
        exchange: 'binance',
        pair: 'BTC/USDT',
        side: 'buy',
        price: '100',
        qty: '1',
        createdAt: '2026-03-01T00:00:00.000Z',
        status: 'NEW',
      },
    ]);
    jest
      .spyOn(service as any, 'publishIntents')
      .mockRejectedValue(new Error('publish failed'));

    await registerPooledSession({
      strategyKey,
      strategyType: 'volume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs,
      runId: 'run-1',
      params: {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        postOnlySide: 'buy',
        executedTrades: 0,
      },
    });

    await expect(service.onTick('2026-03-01T00:00:00.000Z')).resolves.toBe(
      undefined,
    );

    expect(persistStrategyParamsSpy).not.toHaveBeenCalled();
    expect(
      (service as any).sessions.get(strategyKey).params.executedTrades,
    ).toBe(0);
    expect(loggerErrorSpy).toHaveBeenCalledTimes(1);

    dateNowSpy.mockRestore();
  });

  it('registers dex volume strategy params when execution venue is dex', async () => {
    await service.executeVolumeStrategy(
      undefined,
      undefined,
      0.1,
      60,
      1,
      5,
      'user1',
      'client1',
      0,
      undefined,
      'dex',
      'uniswapV3',
      1,
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
      3000,
      100,
      '0x0000000000000000000000000000000000000003',
    );

    const session = (service as any).sessions.get('user1-client1-volume');

    expect(session).toBeDefined();
    expect(session.params.executionVenue).toBe('dex');
    expect(session.params.executionCategory).toBe('amm_dex');
    expect(session.params.dexId).toBe('uniswapV3');
    expect(session.params.chainId).toBe(1);
  });

  it('throws explicit error for clob_dex until adapter is implemented', async () => {
    await expect(
      service.executeVolumeStrategy(
        'dydx',
        'ETH/USDC',
        0.1,
        10,
        1,
        5,
        'user1',
        'client1',
        0,
        undefined,
        'cex',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'clob_dex',
      ),
    ).rejects.toThrow('executionCategory clob_dex is not implemented yet');
  });

  it('publishes amm_dex swap intents and increments executed trades', async () => {
    const nowMs = 1_700_000_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    const strategyKey = 'user1-client1-volume';

    await registerPooledSession({
      strategyKey,
      strategyType: 'volume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs,
      runId: 'run-1',
      params: {
        exchangeName: 'uniswapV3',
        symbol: 'tokenIn/tokenOut',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'amm_dex',
        executionVenue: 'dex',
        postOnlySide: 'buy',
        executedTrades: 0,
        dexId: 'uniswapV3',
        chainId: 1,
        tokenIn: '0x0000000000000000000000000000000000000001',
        tokenOut: '0x0000000000000000000000000000000000000002',
        feeTier: 3000,
        slippageBps: 100,
      },
    });

    (service as any).strategyControllerRegistry = {
      getController: jest.fn().mockImplementation((strategyType: string) => {
        if (strategyType !== 'volume') {
          return undefined;
        }

        return {
          decideActions: jest.fn(
            async (session: any, ts: string, svc: any) =>
              await svc.buildVolumeSessionActions(session, ts),
          ),
          onActionsPublished: jest.fn(
            async (session: any, actions: any[], svc: any) =>
              await svc.onVolumeActionsPublished(session, actions),
          ),
        };
      }),
    };

    await service.onTick('2026-03-01T00:00:00.000Z');

    expect(executorOrchestratorService.dispatchActions).toHaveBeenCalledTimes(
      1,
    );
    expect(executorOrchestratorService.dispatchActions).toHaveBeenCalledWith(
      strategyKey,
      expect.arrayContaining([
        expect.objectContaining({
          type: 'EXECUTE_AMM_SWAP',
          executionCategory: 'amm_dex',
          metadata: expect.objectContaining({
            dexId: 'uniswapV3',
            chainId: 1,
            tokenIn: '0x0000000000000000000000000000000000000001',
          }),
        }),
      ]),
    );
    expect(
      (service as any).sessions.get(strategyKey).params.executedTrades,
    ).toBe(1);

    dateNowSpy.mockRestore();
  });

  it('starts running pooled strategies from persistence', async () => {
    const nowMs = 1_700_000_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);

    mockStrategyInstanceRepository.find.mockResolvedValue([
      {
        strategyKey: 'order-1-pureMarketMaking',
        strategyType: 'pureMarketMaking',
        userId: 'user-1',
        clientId: 'order-1',
        marketMakingOrderId: null,
        parameters: {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          orderRefreshTime: 1500,
        },
      },
    ]);
    (service as any).strategyControllerRegistry = {
      getController: jest.fn().mockImplementation((strategyType: string) => {
        if (strategyType === 'pureMarketMaking') {
          return {
            getCadenceMs: jest.fn(() => 1500),
          };
        }

        return undefined;
      }),
      listControllerTypes: jest.fn(),
    };

    await service.start();

    expect(
      executorRegistry
        .getExecutor('binance', 'BTC/USDT')
        ?.getSession('order-1'),
    ).toEqual(
      expect.objectContaining({
        strategyKey: 'order-1-pureMarketMaking',
        nextRunAtMs: nowMs,
      }),
    );

    dateNowSpy.mockRestore();
  });

  it('queues pooled strategies from persistence until the exchange account is ready', async () => {
    const nowMs = 1_700_000_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);

    exchangeInitService.isReady.mockReturnValue(false);
    mockStrategyInstanceRepository.find.mockResolvedValue([
      {
        strategyKey: 'order-1-pureMarketMaking',
        strategyType: 'pureMarketMaking',
        userId: 'user-1',
        clientId: 'order-1',
        marketMakingOrderId: null,
        parameters: {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          orderRefreshTime: 1500,
          accountLabel: 'default',
        },
      },
    ]);
    (service as any).strategyControllerRegistry = {
      getController: jest.fn().mockImplementation((strategyType: string) => {
        if (strategyType === 'pureMarketMaking') {
          return {
            getCadenceMs: jest.fn(() => 1500),
          };
        }

        return undefined;
      }),
      listControllerTypes: jest.fn(),
    };

    await service.start();

    expect(
      executorRegistry
        .getExecutor('binance', 'BTC/USDT')
        ?.getSession('order-1'),
    ).toBeUndefined();

    exchangeInitService.isReady.mockReturnValue(true);
    await exchangeInitService.emitReady('binance', 'default');

    expect(
      executorRegistry
        .getExecutor('binance', 'BTC/USDT')
        ?.getSession('order-1'),
    ).toEqual(
      expect.objectContaining({
        strategyKey: 'order-1-pureMarketMaking',
        nextRunAtMs: nowMs,
      }),
    );

    dateNowSpy.mockRestore();
  });

  it('rejects legacy arbitrage sessions during start hydration', async () => {
    mockStrategyInstanceRepository.find.mockResolvedValue([
      {
        strategyKey: 'user-2-client-2-arbitrage',
        strategyType: 'arbitrage',
        userId: 'user-2',
        clientId: 'client-2',
        parameters: {
          userId: 'user-2',
          clientId: 'client-2',
          checkIntervalSeconds: 6,
        },
      },
    ]);
    (service as any).strategyControllerRegistry = {
      getController: jest.fn().mockImplementation((strategyType: string) => {
        if (strategyType === 'arbitrage') {
          return {
            getCadenceMs: jest.fn(() => 6000),
          };
        }

        return undefined;
      }),
      listControllerTypes: jest.fn(),
    };

    await expect(service.start()).rejects.toThrow(
      'Cannot create session for strategyKey=user-2-client-2-arbitrage',
    );
    expect((service as any).sessions.has('user-2-client-2-arbitrage')).toBe(
      false,
    );
  });

  it('returns false when routing fill for an exchange pair without executor', async () => {
    await expect(
      service.routeFillForExchangePair('binance', 'BTC/USDT', {
        clientOrderId: 'missing:0',
      }),
    ).resolves.toBe(false);
  });

  it('reruns a strategy via the registered controller', async () => {
    mockStrategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: 'order-1-pureMarketMaking',
      strategyType: 'pureMarketMaking',
      parameters: { clientId: 'order-1' },
    });
    const rerun = jest.fn().mockResolvedValue(undefined);

    (service as any).strategyControllerRegistry = {
      getController: jest.fn().mockReturnValue({ rerun }),
    };

    await expect(
      service.rerunStrategy('order-1-pureMarketMaking'),
    ).resolves.toBe(undefined);
    expect(rerun).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyKey: 'order-1-pureMarketMaking',
      }),
      service,
    );
  });

  it('throws explicit rerun errors for missing strategy or controller', async () => {
    mockStrategyInstanceRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        strategyKey: 'order-1-pureMarketMaking',
        strategyType: 'pureMarketMaking',
        parameters: {},
      });
    (service as any).strategyControllerRegistry = {
      getController: jest.fn().mockReturnValue(undefined),
    };

    await expect(service.rerunStrategy('missing')).rejects.toThrow(
      'Strategy with key missing not found.',
    );
    await expect(
      service.rerunStrategy('order-1-pureMarketMaking'),
    ).rejects.toThrow(
      'Strategy controller for type pureMarketMaking is not registered',
    );
  });

  it('throws explicit error when cadence is requested for an unknown controller', () => {
    (service as any).strategyControllerRegistry = {
      getController: jest.fn().mockReturnValue(undefined),
    };

    expect(() => service.getCadenceMs({}, 'pureMarketMaking')).toThrow(
      'Strategy controller for type pureMarketMaking is not registered',
    );
  });

  it('requires both dual-account labels to be ready before activation', () => {
    exchangeInitService.isReady
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);

    expect(
      (service as any).canActivateStrategyImmediately({
        strategyType: 'dualAccountVolume',
        clientId: 'client-1',
        parameters: {
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          makerAccountLabel: 'maker',
          takerAccountLabel: 'taker',
        },
      }),
    ).toBe(false);

    expect(
      (service as any).canActivateStrategyImmediately({
        strategyType: 'dualAccountVolume',
        clientId: 'client-1',
        parameters: {
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          makerAccountLabel: 'maker',
          takerAccountLabel: 'taker',
        },
      }),
    ).toBe(true);
  });

  it('publishes dual-account maker intents and persists published cycles', async () => {
    const session = {
      runId: 'run-dual',
      strategyKey: 'user1-client1-dualAccountVolume',
      strategyType: 'dualAccountVolume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: 0,
      params: {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        makerDelayMs: 250,
        dynamicRoleSwitching: false,
        targetQuoteVolume: 0,
        publishedCycles: 0,
        completedCycles: 0,
      },
    };

    mockStrategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: session.strategyKey,
      parameters: session.params,
    });
    exchangeOrderTrackerService.getTrackedOrders.mockReturnValue([]);
    strategyMarketDataProviderService.getBestBidAsk.mockResolvedValue({
      bestBid: 100,
      bestAsk: 101,
    });

    const actions = await service.buildDualAccountVolumeSessionActions(
      session as any,
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toEqual([
      expect.objectContaining({
        accountLabel: 'maker',
        postOnly: true,
        metadata: expect.objectContaining({
          role: 'maker',
          makerAccountLabel: 'maker',
          takerAccountLabel: 'taker',
        }),
      }),
    ]);

    (service as any).sessions.set(session.strategyKey, session);
    await service.onDualAccountVolumeActionsPublished(session as any, actions);

    expect(mockStrategyInstanceRepository.update).toHaveBeenCalledWith(
      { strategyKey: session.strategyKey },
      expect.objectContaining({
        parameters: expect.objectContaining({ publishedCycles: 1 }),
      }),
    );
  });

  it('preserves only hot-config fields while keeping runtime dual-account counters', async () => {
    const session = {
      runId: 'run-dual-merge',
      strategyKey: 'user1-client1-dualAccountVolume',
      strategyType: 'dualAccountVolume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: 0,
      params: {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        makerDelayMs: 250,
        dynamicRoleSwitching: false,
        targetQuoteVolume: 0,
        publishedCycles: 0,
        completedCycles: 0,
      },
    };

    mockStrategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: session.strategyKey,
      parameters: {
        ...session.params,
        publishedCycles: 0,
        completedCycles: 1,
        tradedQuoteVolume: 100,
        baseIntervalTime: 15,
      },
    });

    (service as any).sessions.set(session.strategyKey, session);
    await service.onDualAccountVolumeActionsPublished(session as any, [
      { type: 'CREATE_LIMIT_ORDER' } as any,
    ]);

    expect(mockStrategyInstanceRepository.update).toHaveBeenCalledWith(
      { strategyKey: session.strategyKey },
      expect.objectContaining({
        parameters: expect.objectContaining({
          publishedCycles: 1,
          completedCycles: 0,
          baseIntervalTime: 15,
        }),
      }),
    );
  });

  it('does not let persisted dual-account counters overwrite runtime counters', async () => {
    const session = {
      runId: 'run-dual-runtime-wins',
      strategyKey: 'user1-client1-dualAccountVolume',
      strategyType: 'dualAccountVolume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: 0,
      params: {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 5,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        makerDelayMs: 250,
        dynamicRoleSwitching: false,
        targetQuoteVolume: 0,
        publishedCycles: 3,
        completedCycles: 2,
        tradedQuoteVolume: 250,
      },
    };

    mockStrategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: session.strategyKey,
      parameters: {
        ...session.params,
        publishedCycles: 1,
        completedCycles: 0,
        tradedQuoteVolume: 100,
        baseIntervalTime: 30,
      },
    });

    (service as any).sessions.set(session.strategyKey, session);
    await service.onDualAccountVolumeActionsPublished(session as any, [
      { type: 'CREATE_LIMIT_ORDER' } as any,
    ]);

    expect(mockStrategyInstanceRepository.update).toHaveBeenCalledWith(
      { strategyKey: session.strategyKey },
      expect.objectContaining({
        parameters: expect.objectContaining({
          publishedCycles: 4,
          completedCycles: 2,
          tradedQuoteVolume: 250,
          baseIntervalTime: 30,
        }),
      }),
    );
  });

  it('skips dual-account volume actions when tracked order book is unavailable', async () => {
    strategyMarketDataProviderService.getTrackedBestBidAsk = jest
      .fn()
      .mockReturnValue(null);

    const actions = await service.buildDualAccountVolumeActions(
      'dual-key',
      {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        makerDelayMs: 250,
        dynamicRoleSwitching: false,
        publishedCycles: 0,
        completedCycles: 0,
      } as any,
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toEqual([]);
  });

  it('switches dual-account maker/taker roles when dynamic switching finds higher capacity on the taker side', async () => {
    strategyMarketDataProviderService.getBestBidAsk.mockResolvedValue({
      bestBid: 100,
      bestAsk: 101,
    });
    exchangeConnectorAdapterService.fetchBalance
      .mockResolvedValueOnce({
        free: { BTC: 5, USDT: 10 },
      })
      .mockResolvedValueOnce({
        free: { BTC: 0.1, USDT: 5000 },
      });

    const actions = await service.buildDualAccountVolumeActions(
      'dual-key',
      {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        makerDelayMs: 250,
        dynamicRoleSwitching: true,
        publishedCycles: 0,
        completedCycles: 0,
      } as any,
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toEqual([
      expect.objectContaining({
        accountLabel: 'taker',
        metadata: expect.objectContaining({
          makerAccountLabel: 'taker',
          takerAccountLabel: 'maker',
          dynamicRoleSwitching: true,
        }),
      }),
    ]);
  });

  it('applies dual-account randomness and account profiles when building actions', async () => {
    strategyMarketDataProviderService.getTrackedBestBidAsk = jest
      .fn()
      .mockReturnValue({
        bestBid: 100,
        bestAsk: 102,
      });
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.25)
      .mockReturnValueOnce(0.75)
      .mockReturnValueOnce(0.1);

    const actions = await service.buildDualAccountVolumeActions(
      'dual-key',
      {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 2,
        baseIntervalTime: 10,
        baseTradeAmount: 4,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        makerDelayMs: 250,
        tradeAmountVariance: 0.5,
        priceOffsetVariance: 0.5,
        makerDelayVariance: 0.5,
        buyBias: 0.7,
        accountProfiles: {
          maker: {
            tradeAmountMultiplier: 1.5,
            priceOffsetMultiplier: 0.5,
            makerDelayMultiplier: 2,
          },
        },
        dynamicRoleSwitching: false,
        publishedCycles: 0,
        completedCycles: 0,
      } as any,
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toEqual([
      expect.objectContaining({
        side: 'sell',
        price: '100.5',
        qty: '7.5',
        metadata: expect.objectContaining({
          activeHours: undefined,
          buyBias: 0.7,
          makerDelayMs: 300,
        }),
      }),
    ]);
    jest.restoreAllMocks();
  });

  it('recalculates dual-account cadence jitter across ticks', async () => {
    const activeSession = {
      runId: 'run-cadence',
      strategyKey: 'dual-cadence',
      strategyType: 'dualAccountVolume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 10000,
      nextRunAtMs: 0,
      params: {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 1,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 10,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        makerDelayMs: 250,
        cadenceVariance: 0.2,
        publishedCycles: 1,
        completedCycles: 0,
      },
    };

    mockStrategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: activeSession.strategyKey,
      parameters: activeSession.params,
    });
    (service as any).sessions.set(activeSession.strategyKey, activeSession);
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.25)
      .mockReturnValueOnce(0.75);

    await service.onDualAccountVolumeActionsPublished(activeSession as any, [
      { type: 'CREATE_LIMIT_ORDER' } as any,
    ]);

    const updatedSession = (service as any).sessions.get(
      activeSession.strategyKey,
    );

    expect(updatedSession.cadenceMs).toBe(9000);
    jest.restoreAllMocks();
  });

  it('skips dual-account volume actions when maker profile is outside active hours', async () => {
    strategyMarketDataProviderService.getTrackedBestBidAsk = jest
      .fn()
      .mockReturnValue({
        bestBid: 100,
        bestAsk: 102,
      });
    const serviceDateSpy = jest
      .spyOn(Date.prototype, 'getHours')
      .mockReturnValue(8);

    const actions = await service.buildDualAccountVolumeActions(
      'dual-key',
      {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 2,
        baseIntervalTime: 10,
        baseTradeAmount: 4,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        makerDelayMs: 250,
        accountProfiles: {
          maker: {
            activeHours: [10, 11],
          },
        },
        dynamicRoleSwitching: false,
        publishedCycles: 0,
        completedCycles: 0,
      } as any,
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toEqual([]);
    serviceDateSpy.mockRestore();
  });

  it('cancels dangling dual-account maker orders during runtime restore', async () => {
    exchangeOrderTrackerService.getTrackedOrders.mockReturnValue([
      {
        orderId: 'dual-cycle-1',
        strategyKey: 'user1-client1-dualAccountVolume',
        exchange: 'binance',
        accountLabel: 'maker',
        pair: 'BTC/USDT',
        exchangeOrderId: 'maker-order-1',
        side: 'buy',
        price: '100',
        qty: '1',
        status: 'open',
        role: 'maker',
        createdAt: '2026-04-11T00:00:00.000Z',
        updatedAt: '2026-04-11T00:00:00.000Z',
      },
    ]);
    jest
      .spyOn(service as any, 'waitForTrackedOrdersToSettle')
      .mockResolvedValue(undefined);

    await (service as any).restoreRuntimeStateForStrategy({
      strategyKey: 'user1-client1-dualAccountVolume',
      strategyType: 'dualAccountVolume',
    });

    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'maker-order-1',
      'maker',
    );
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'maker-order-1',
        accountLabel: 'maker',
        role: 'maker',
        status: 'cancelled',
      }),
    );
    expect((service as any).waitForTrackedOrdersToSettle).toHaveBeenCalledWith(
      'user1-client1-dualAccountVolume',
      10_000,
    );
  });

  it('stops dual-account volume when target quote volume is reached', async () => {
    const stopStrategyForUserSpy = jest
      .spyOn(service, 'stopStrategyForUser')
      .mockResolvedValue(undefined);
    const session = {
      runId: 'run-target',
      strategyKey: 'dual-target',
      strategyType: 'dualAccountVolume',
      userId: 'user-1',
      clientId: 'client-1',
      cadenceMs: 1000,
      nextRunAtMs: 0,
      tradedQuoteVolume: 1500,
      params: {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 100,
        userId: 'user-1',
        clientId: 'client-1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        makerDelayMs: 250,
        publishedCycles: 0,
        completedCycles: 0,
        targetQuoteVolume: 1000,
        tradedQuoteVolume: 1500,
      },
    };

    mockStrategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: session.strategyKey,
      parameters: session.params,
    });
    (service as any).sessions.set(session.strategyKey, session);

    await expect(
      service.buildDualAccountVolumeSessionActions(
        session as any,
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);

    expect(stopStrategyForUserSpy).toHaveBeenCalledWith(
      'user-1',
      'client-1',
      'dualAccountVolume',
    );
  });

  it('stops a completed volume session and skips stale stop attempts', async () => {
    const stopStrategyForUserSpy = jest
      .spyOn(service, 'stopStrategyForUser')
      .mockResolvedValue(undefined);
    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);
    const session = {
      runId: 'run-1',
      strategyKey: 'volume-key',
      strategyType: 'volume',
      userId: 'user-1',
      clientId: 'client-1',
      cadenceMs: 1000,
      nextRunAtMs: 0,
      params: {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 2,
        userId: 'user-1',
        clientId: 'client-1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executedTrades: 2,
      },
    };

    (service as any).sessions.set('volume-key', session);

    await expect(
      service.buildVolumeSessionActions(
        session as any,
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);
    expect(stopStrategyForUserSpy).toHaveBeenCalledWith(
      'user-1',
      'client-1',
      'volume',
    );

    (service as any).sessions.set('volume-key', {
      ...session,
      runId: 'run-2',
    });
    stopStrategyForUserSpy.mockClear();

    await expect(
      service.buildVolumeSessionActions(
        session as any,
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);
    expect(stopStrategyForUserSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('skips volume actions for invalid price and invalid qty', async () => {
    const errorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    strategyMarketDataProviderService.getBestBidAsk.mockResolvedValueOnce({
      bestBid: 100,
      bestAsk: 100,
    });
    await expect(
      service.buildVolumeActions(
        'volume-key',
        {
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          baseIncrementPercentage: 150,
          baseIntervalTime: 10,
          baseTradeAmount: 1,
          numTrades: 2,
          userId: 'user-1',
          clientId: 'client-1',
          pricePushRate: 0,
          executionCategory: 'clob_cex',
          executionVenue: 'cex',
          executedTrades: 0,
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    strategyMarketDataProviderService.getBestBidAsk.mockResolvedValueOnce({
      bestBid: 100,
      bestAsk: 101,
    });
    await expect(
      service.buildVolumeActions(
        'volume-key',
        {
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          baseIncrementPercentage: 1,
          baseIntervalTime: 10,
          baseTradeAmount: 0,
          numTrades: 2,
          userId: 'user-1',
          clientId: 'client-1',
          pricePushRate: 0,
          executionCategory: 'clob_cex',
          executionVenue: 'cex',
          executedTrades: 0,
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('passes open order counts into quote manager and respects pure market making filters', async () => {
    (service as any).exchangeOrderTrackerService = {
      getOpenOrders: jest
        .fn()
        .mockReturnValue([{ side: 'buy' }, { side: 'buy' }, { side: 'sell' }]),
    };
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([
        {
          layer: 1,
          side: 'buy',
          price: '99',
          qty: '1',
          shouldCreate: true,
        },
        {
          layer: 1,
          side: 'sell',
          price: '101',
          qty: '1',
          shouldCreate: true,
        },
      ]),
    };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
          ceilingPrice: 90,
          floorPrice: 110,
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);
    expect(
      (service as any).quoteExecutorManagerService.buildQuotes,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        midPrice: '100',
        numberOfLayers: 1,
      }),
    );
  });

  it('returns no pure market making actions when the price source is unavailable or invalid', async () => {
    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    strategyMarketDataProviderService.getReferencePrice.mockRejectedValueOnce(
      new Error('feed down'),
    );
    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);

    strategyMarketDataProviderService.getReferencePrice.mockResolvedValueOnce(
      0,
    );
    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('enforces minimum spread, sets postOnly, and skips refresh within tolerance', async () => {
    (service as any).exchangeOrderTrackerService = {
      getOpenOrders: jest.fn().mockReturnValue([
        {
          side: 'buy',
          price: '99',
          status: 'open',
        },
        {
          side: 'sell',
          price: '101',
          status: 'open',
        },
      ]),
    };
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([
        {
          layer: 1,
          side: 'buy',
          price: '99.5',
          qty: '1',
          shouldCreate: true,
        },
        {
          layer: 1,
          side: 'sell',
          price: '101',
          qty: '1',
          shouldCreate: true,
        },
      ]),
    };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
          minimumSpread: 0.01,
          orderRefreshTolerancePct: 0.02,
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);

    (service as any).exchangeOrderTrackerService.getOpenOrders.mockReturnValue(
      [],
    );

    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
          minimumSpread: 0.01,
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        side: 'sell',
        postOnly: true,
      }),
    ]);
  });

  it('cancels an occupied slot without recreating it in the same tick when outside tolerance', async () => {
    (service as any).exchangeOrderTrackerService = {
      getActiveSlotOrders: jest.fn().mockReturnValue([
        {
          exchangeOrderId: 'ex-buy-1',
          slotKey: 'layer-1-buy',
          side: 'buy',
          price: '95',
          qty: '1',
          status: 'open',
        },
      ]),
      getLiveOrders: jest.fn().mockReturnValue([
        {
          exchangeOrderId: 'ex-buy-1',
          slotKey: 'layer-1-buy',
          side: 'buy',
          price: '95',
          qty: '1',
          status: 'open',
          createdAt: '2026-03-11T00:00:00.000Z',
        },
      ]),
    };
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([
        {
          layer: 1,
          slotKey: 'layer-1-buy',
          side: 'buy',
          price: '99',
          qty: '1',
        },
      ]),
    };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        type: 'CANCEL_ORDER',
        mixinOrderId: 'ex-buy-1',
        slotKey: 'layer-1-buy',
      }),
    ]);
  });

  it('does not create a duplicate PMM order when the slot is already pending create', async () => {
    (service as any).exchangeOrderTrackerService = {
      getActiveSlotOrders: jest.fn().mockReturnValue([
        {
          exchangeOrderId: 'ex-pending-1',
          slotKey: 'layer-1-buy',
          side: 'buy',
          price: '99',
          qty: '1',
          status: 'pending_create',
        },
      ]),
      getLiveOrders: jest.fn().mockReturnValue([]),
    };
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([
        {
          layer: 1,
          slotKey: 'layer-1-buy',
          side: 'buy',
          price: '99',
          qty: '1',
        },
      ]),
    };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);
  });

  it('quantizes PMM quotes and skips unaffordable or below-minimum orders', async () => {
    (service as any).exchangeOrderTrackerService = {
      getOpenOrders: jest.fn().mockReturnValue([]),
    };
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([
        {
          layer: 1,
          side: 'buy',
          price: '100.129',
          qty: '0.1239',
          shouldCreate: true,
        },
      ]),
    };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        price: '100.129',
        qty: '0.1239',
      }),
    ]);

    exchangeConnectorAdapterService.fetchBalance.mockResolvedValueOnce({
      free: { BTC: 0, USDT: 1 },
    });

    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);
  });

  it('reserves balances across PMM quotes within the same tick', async () => {
    (service as any).exchangeOrderTrackerService = {
      getOpenOrders: jest.fn().mockReturnValue([]),
    };
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([
        {
          layer: 1,
          side: 'buy',
          price: '100',
          qty: '5',
          shouldCreate: true,
        },
        {
          layer: 2,
          side: 'buy',
          price: '100',
          qty: '6',
          shouldCreate: true,
        },
      ]),
    };
    exchangeConnectorAdapterService.fetchBalance.mockResolvedValueOnce({
      free: { BTC: 0, USDT: 1000 },
    });
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 2,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toHaveLength(1);
  });

  it('gates PMM action building when connector health is degraded and restores on success', async () => {
    (service as any).setConnectorHealthStatus('binance', 'DEGRADED');

    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);

    (service as any).setConnectorHealthStatus('binance', 'CONNECTED');
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([
        {
          layer: 1,
          side: 'sell',
          price: '101',
          qty: '1',
          shouldCreate: true,
        },
      ]),
    };

    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toHaveLength(1);
  });

  it('triggers the PMM kill switch and stops the strategy when realized loss breaches the threshold', async () => {
    (service as any).sessions.set('order-1-pureMarketMaking', {
      runId: 'run-1',
      strategyKey: 'order-1-pureMarketMaking',
      strategyType: 'pureMarketMaking',
      userId: 'user-1',
      clientId: 'order-1',
      marketMakingOrderId: 'order-1',
      cadenceMs: 1000,
      nextRunAtMs: 0,
      realizedPnlQuote: -25,
      tradedQuoteVolume: 100,
      params: {
        exchangeName: 'binance',
        pair: 'BTC/USDT',
      },
    });
    exchangeOrderTrackerService.getTrackedOrders.mockReturnValue([]);

    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
          killSwitchThreshold: 10,
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);

    expect(mockStrategyInstanceRepository.update).toHaveBeenCalledWith(
      { strategyKey: 'order-1-pureMarketMaking' },
      expect.objectContaining({ status: 'stopped' }),
    );
    expect(
      strategyIntentStoreService.cancelPendingIntents,
    ).toHaveBeenCalledWith(
      'order-1-pureMarketMaking',
      'strategy stopped before intent execution',
    );
    expect(executorOrchestratorService.dispatchActions).toHaveBeenCalledWith(
      'order-1-pureMarketMaking',
      expect.arrayContaining([
        expect.objectContaining({
          type: 'STOP_CONTROLLER',
        }),
      ]),
    );
  });

  it('emits cancel actions for stale or far-drifted PMM orders', async () => {
    (service as any).exchangeOrderTrackerService = {
      getOpenOrders: jest.fn().mockReturnValue([
        {
          exchangeOrderId: 'ex-old',
          side: 'buy',
          price: '90',
          qty: '1',
          createdAt: '2020-01-01T00:00:00.000Z',
          status: 'open',
        },
      ]),
    };
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([]),
    };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    await expect(
      service.buildPureMarketMakingActions(
        'order-1-pureMarketMaking',
        {
          userId: 'user-1',
          clientId: 'order-1',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.01,
          askSpread: 0.01,
          orderAmount: 1,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
          maxOrderAge: 1000,
          hangingOrdersCancelPct: 0.05,
        },
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        type: 'CANCEL_ORDER',
        mixinOrderId: 'ex-old',
      }),
    ]);
  });

  it('builds a time indicator entry when EMA crossover and balances allow it', async () => {
    const params: TimeIndicatorStrategyDto = {
      userId: 'user-1',
      clientId: 'client-1',
      exchangeName: 'binance',
      symbol: 'BTC/USDT',
      timeframe: '5m',
      lookback: 20,
      emaFast: 3,
      emaSlow: 5,
      rsiPeriod: 3,
      indicatorMode: 'ema',
      orderMode: 'quote',
      orderSize: 100,
      tickIntervalMs: 1000,
    };
    const exchange = {
      id: 'binance',
      markets: {
        'BTC/USDT': {
          limits: {
            amount: { min: 0.001 },
            cost: { min: 10 },
          },
        },
      },
      timeframes: { '5m': true },
      loadMarkets: jest.fn(),
      fetchOpenOrders: jest.fn().mockResolvedValue([]),
      fetchBalance: jest.fn().mockResolvedValue({
        free: { BTC: 10, USDT: 1000 },
      }),
      amountToPrecision: jest.fn((_symbol: string, value: number) =>
        value.toFixed(4),
      ),
      priceToPrecision: jest.fn((_symbol: string, value: number) =>
        value.toFixed(2),
      ),
    };

    jest
      .spyOn(exchangeInitService, 'getExchange')
      .mockReturnValue(exchange as any);
    jest.spyOn(service as any, 'fetchCandles').mockResolvedValue([
      [0, 0, 0, 0, 90],
      [0, 0, 0, 0, 95],
      [0, 0, 0, 0, 100],
      [0, 0, 0, 0, 100],
      [0, 0, 0, 0, 100],
      [0, 0, 0, 0, 100],
      [0, 0, 0, 0, 100],
    ]);
    jest
      .spyOn(service as any, 'calcEma')
      .mockReturnValueOnce([90, 95, 99, 101, 103, 104, 105])
      .mockReturnValueOnce([100, 100, 100, 100, 100, 100, 100]);
    jest.spyOn(service as any, 'calcRsi').mockReturnValue([50, 50, 50, 50]);
    jest.spyOn(service as any, 'calcCross').mockReturnValue('CROSS_UP');

    await expect(
      service.buildTimeIndicatorActions(
        {
          runId: 'run-1',
          strategyKey: 'user-1-client-1-timeIndicator',
          strategyType: 'timeIndicator',
          userId: 'user-1',
          clientId: 'client-1',
          cadenceMs: 1000,
          nextRunAtMs: 0,
          params,
        } as any,
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        type: 'CREATE_LIMIT_ORDER',
        side: 'buy',
        pair: 'BTC/USDT',
        qty: '1',
        price: '99.9',
      }),
    ]);
  });

  it('skips time indicator actions outside the allowed window or when exchange is missing', async () => {
    const currentWeekday = new Date().getDay();
    const outsideWindowParams: TimeIndicatorStrategyDto = {
      userId: 'user-1',
      clientId: 'client-1',
      exchangeName: 'binance',
      symbol: 'BTC/USDT',
      timeframe: '5m',
      lookback: 20,
      emaFast: 3,
      emaSlow: 5,
      rsiPeriod: 3,
      indicatorMode: 'ema',
      orderMode: 'quote',
      orderSize: 100,
      tickIntervalMs: 1000,
      allowedWeekdays: [(currentWeekday + 1) % 7],
    };
    const errorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(
      service.buildTimeIndicatorActions(
        {
          runId: 'run-1',
          strategyKey: 'user-1-client-1-timeIndicator',
          strategyType: 'timeIndicator',
          userId: 'user-1',
          clientId: 'client-1',
          cadenceMs: 1000,
          nextRunAtMs: 0,
          params: outsideWindowParams,
        } as any,
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);

    jest
      .spyOn(exchangeInitService, 'getExchange')
      .mockReturnValue(undefined as any);

    await expect(
      service.buildTimeIndicatorActions(
        {
          runId: 'run-1',
          strategyKey: 'user-1-client-1-timeIndicator',
          strategyType: 'timeIndicator',
          userId: 'user-1',
          clientId: 'client-1',
          cadenceMs: 1000,
          nextRunAtMs: 0,
          params: {
            ...outsideWindowParams,
            allowedWeekdays: undefined,
          },
        } as any,
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
