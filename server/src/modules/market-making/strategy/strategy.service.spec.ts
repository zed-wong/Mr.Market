/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';

import { BalanceStateCacheService } from '../balance-state/balance-state-cache.service';
import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { ExchangeOrderMappingService } from '../execution/exchange-order-mapping.service';
import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { PerformanceService } from '../performance/performance.service';
import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';
import { UserStreamIngestionService } from '../trackers/user-stream-ingestion.service';
import { PureMarketMakingStrategyDto } from './config/strategy.dto';
import { StrategyControllerRegistry } from './controllers/strategy-controller.registry';
import { StrategyMarketDataProviderService } from './data/strategy-market-data-provider.service';
import { ExecutorRegistry } from './execution/executor-registry';
import { StrategyIntentStoreService } from './execution/strategy-intent-store.service';
import { ExecutorOrchestratorService } from './intent/executor-orchestrator.service';
import { FillSettlementService } from './settlement/fill-settlement.service';
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
    debitFee: jest.Mock;
    getExistingBalance: jest.Mock;
    isReservationPaused: jest.Mock;
  };
  let balanceStateCacheService: {
    hasFreshAccountSnapshot: jest.Mock;
    getSnapshotDiagnostic: jest.Mock;
    getBalance: jest.Mock;
  };
  let cachedBalancesByAccount: Record<string, Record<string, string>>;
  let exchangeOrderTrackerService: {
    getOpenOrders: jest.Mock;
    getLiveOrders: jest.Mock;
    getActiveSlotOrders: jest.Mock;
    getTrackedOrders: jest.Mock;
    getByExchangeOrderId: jest.Mock;
    upsertOrder: jest.Mock;
  };
  let userStreamIngestionService: {
    startOrderWatcher: jest.Mock;
    stopOrderWatcher: jest.Mock;
    startTradeWatcher: jest.Mock;
    stopTradeWatcher: jest.Mock;
    startBalanceWatcher: jest.Mock;
    stopBalanceWatcher: jest.Mock;
  };
  let strategyMarketDataProviderService: {
    getReferencePrice: jest.Mock;
    getTrackedBestBidAsk: jest.Mock;
    getBestBidAsk: jest.Mock;
    getOrderBook: jest.Mock;
    hasTrackedOrderBook: jest.Mock;
    getAdaptivePmmSignalSnapshot: jest.Mock;
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
  const mockMarketMakingOrderRepository = {
    findOne: jest.fn(),
  };
  const mockStrategyExecutionHistoryRepository = {
    create: jest.fn((entity: any) => entity),
    save: jest.fn().mockResolvedValue(undefined),
  };

  const setCachedBalances = (
    balancesByAccount: Record<string, Record<string, number | string>>,
  ) => {
    cachedBalancesByAccount = Object.fromEntries(
      Object.entries(balancesByAccount).map(([accountLabel, balances]) => [
        accountLabel,
        Object.fromEntries(
          Object.entries(balances).map(([asset, free]) => [
            asset.toUpperCase(),
            String(free),
          ]),
        ),
      ]),
    );
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
      | 'dualAccountBestCapacityVolume'
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
      debitFee: jest.fn().mockResolvedValue({ applied: true }),
      getExistingBalance: jest.fn(async (_orderId: string, assetId: string) => {
        const available =
          cachedBalancesByAccount.default?.[assetId.toUpperCase()] || '0';

        return { available, total: available };
      }),
      isReservationPaused: jest.fn().mockReturnValue(false),
    };
    setCachedBalances({
      default: { BTC: 10, USDT: 1000 },
      maker: { BTC: 10, USDT: 1000 },
      taker: { BTC: 10, USDT: 1000 },
    });
    balanceStateCacheService = {
      hasFreshAccountSnapshot: jest.fn().mockReturnValue(true),
      getSnapshotDiagnostic: jest.fn().mockReturnValue({
        present: true,
        fresh: true,
        ageMs: 0,
        freshnessTimestamp: '2026-03-11T00:00:00.000Z',
        source: 'ws',
      }),
      getBalance: jest.fn(
        (_exchange: string, _accountLabel: string, asset: string) => ({
          exchange: _exchange,
          accountLabel: _accountLabel,
          asset,
          free:
            cachedBalancesByAccount[_accountLabel || 'default']?.[
              asset.toUpperCase()
            ] || '0',
          source: 'ws',
          freshnessTimestamp: '2026-03-11T00:00:00.000Z',
        }),
      ),
    };
    exchangeOrderTrackerService = {
      getOpenOrders: jest.fn().mockReturnValue([]),
      getLiveOrders: jest.fn().mockReturnValue([]),
      getActiveSlotOrders: jest.fn().mockReturnValue([]),
      getTrackedOrders: jest.fn().mockReturnValue([]),
      getByExchangeOrderId: jest.fn().mockReturnValue(undefined),
      upsertOrder: jest.fn(),
    };
    userStreamIngestionService = {
      startOrderWatcher: jest.fn(),
      stopOrderWatcher: jest.fn(),
      startTradeWatcher: jest.fn(),
      stopTradeWatcher: jest.fn(),
      startBalanceWatcher: jest.fn(),
      stopBalanceWatcher: jest.fn(),
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
      }),
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
    mockMarketMakingOrderRepository.findOne.mockResolvedValue({
      orderId: 'default-order',
      state: 'running',
    });
    mockStrategyExecutionHistoryRepository.create.mockImplementation(
      (entity: any) => entity,
    );
    mockStrategyExecutionHistoryRepository.save.mockResolvedValue(undefined);

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
        FillSettlementService,
        {
          provide: BalanceStateCacheService,
          useValue: balanceStateCacheService,
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
          provide: UserStreamIngestionService,
          useValue: userStreamIngestionService,
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
        {
          provide: getRepositoryToken(MarketMakingOrder),
          useValue: mockMarketMakingOrderRepository,
        },
        {
          provide: getRepositoryToken(StrategyExecutionHistory),
          useValue: mockStrategyExecutionHistoryRepository,
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

  it('ticks all executors in parallel rather than serially', async () => {
    const callOrder: string[] = [];
    const executorA = {
      exchange: 'binance',
      pair: 'BTC/USDT',
      getActiveSessions: () => [],
      getDueSessionCount: () => 0,
      onTick: jest.fn(async () => {
        callOrder.push('a-start');
        await new Promise((resolve) => setTimeout(resolve, 50));
        callOrder.push('a-end');
      }),
    };
    const executorB = {
      exchange: 'okx',
      pair: 'ETH/USDT',
      getActiveSessions: () => [],
      getDueSessionCount: () => 0,
      onTick: jest.fn(async () => {
        callOrder.push('b-start');
        await new Promise((resolve) => setTimeout(resolve, 50));
        callOrder.push('b-end');
      }),
    };

    jest
      .spyOn(executorRegistry, 'getActiveExecutors')
      .mockReturnValue([executorA, executorB] as any);

    await service.onTick('2026-04-29T00:00:00.000Z');

    expect(executorA.onTick).toHaveBeenCalled();
    expect(executorB.onTick).toHaveBeenCalled();
    expect(callOrder).toEqual(['a-start', 'b-start', 'a-end', 'b-end']);
  });

  it('starts balance watchers for pure market making sessions', async () => {
    await registerPooledSession({
      strategyKey: 'order-1-pureMarketMaking',
      strategyType: 'pureMarketMaking',
      userId: 'user-1',
      clientId: 'order-1',
      cadenceMs: 1000,
      params: {
        userId: 'user-1',
        clientId: 'order-1',
        pair: 'BTC/USDT',
        exchangeName: 'binance',
        accountLabel: 'maker',
        bidSpread: 0.01,
        askSpread: 0.01,
        orderAmount: 1,
        orderRefreshTime: 1000,
        numberOfLayers: 1,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
      },
      marketMakingOrderId: 'order-1',
    });

    expect(userStreamIngestionService.startBalanceWatcher).toHaveBeenCalledWith(
      {
        exchange: 'binance',
        accountLabel: 'maker',
      },
    );
  });

  it('restores tracked PMM orders and cancels orphan exchange orders on startup', async () => {
    const strategy = {
      strategyKey: 'order-1-pureMarketMaking',
      strategyType: 'pureMarketMaking',
      userId: 'user-1',
      clientId: 'order-1',
      marketMakingOrderId: 'order-1',
      status: 'running',
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
    exchangeConnectorAdapterService.cancelOrder.mockResolvedValueOnce({
      status: 'closed',
    });
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
      orderId: 'client1',
      userId: '1',
      assetId: 'BTC',
      amount: '0.5',
      idempotencyKey:
        'mm-fill:client1-pureMarketMaking:ex-1:client1:0:buy:100:0.5:base',
      refType: 'market_making_fill',
      refId: 'ex-1',
    });
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(2, {
      orderId: 'client1',
      userId: '1',
      assetId: 'USDT',
      amount: '-50',
      idempotencyKey:
        'mm-fill:client1-pureMarketMaking:ex-1:client1:0:buy:100:0.5:quote',
      refType: 'market_making_fill',
      refId: 'ex-1',
    });
  });

  it('debits actual fill fees from the fee asset when a fill carries exchange fee data', async () => {
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
        fillId: 'fill-1',
        side: 'buy',
        price: '100',
        qty: '0.5',
        feeAmount: '0.0005',
        feeAsset: 'BTC',
        receivedAt: '2026-03-18T00:00:00.000Z',
      }),
    ).resolves.toBe(true);

    expect(balanceLedgerService.debitFee).toHaveBeenCalledWith({
      orderId: 'client1',
      userId: '1',
      assetId: 'BTC',
      amount: '0.0005',
      idempotencyKey: 'mm-fill:client1-pureMarketMaking:fill-1:fee:BTC',
      refType: 'market_making_fee',
      refId: 'ex-1',
    });
  });

  it('keeps fill settlement applied when actual fee debit requires manual review', async () => {
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

    balanceLedgerService.debitFee.mockRejectedValue(
      new Error('insufficient available balance'),
    );
    await service.executePureMarketMakingStrategy(strategyParamsDto);

    await expect(
      service.routeFillForExchangePair('bitfinex', 'BTC/USDT', {
        orderId: 'client1',
        clientOrderId: 'client1:0',
        exchangeOrderId: 'ex-1',
        fillId: 'fill-1',
        side: 'buy',
        price: '100',
        qty: '0.5',
        feeAmount: '0.0005',
        feeAsset: 'BTC',
        receivedAt: '2026-03-18T00:00:00.000Z',
      }),
    ).resolves.toBe(true);

    expect(balanceLedgerService.adjust).toHaveBeenCalledTimes(2);
    expect(balanceLedgerService.debitFee).toHaveBeenCalledTimes(1);
  });

  it('tracks realized quote PnL per pure market-making order from matched fills', async () => {
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
      exchangeOrderId: 'buy-1',
      fillId: 'fill-buy-1',
      side: 'buy',
      price: '100',
      qty: '1',
      receivedAt: '2026-03-18T00:00:00.000Z',
    });
    await service.routeFillForExchangePair('bitfinex', 'BTC/USDT', {
      orderId: 'client1',
      clientOrderId: 'client1:1',
      exchangeOrderId: 'sell-1',
      fillId: 'fill-sell-1',
      side: 'sell',
      price: '110',
      qty: '1',
      receivedAt: '2026-03-18T00:01:00.000Z',
    });

    const session = executorRegistry
      .getExecutor('bitfinex', 'BTC/USDT')
      ?.getSession('client1');

    expect(session).toEqual(
      expect.objectContaining({
        inventoryBaseQty: 0,
        inventoryCostQuote: 0,
        realizedPnlQuote: 10,
        tradedQuoteVolume: 210,
        params: expect.objectContaining({
          inventoryBaseQty: 0,
          inventoryCostQuote: 0,
          realizedPnlQuote: 10,
          tradedQuoteVolume: 210,
        }),
      }),
    );
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
          'mm-fill:client1-pureMarketMaking:ex-1:buy:1.5:base',
      }),
    );
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        idempotencyKey:
          'mm-fill:client1-pureMarketMaking:ex-1:buy:1.5:base',
      }),
    );
  });

  it('uses cumulative order progress before fillId when building ledger idempotency keys', async () => {
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
        idempotencyKey:
          'mm-fill:client1-pureMarketMaking:ex-1:buy:1.5:base',
      }),
    );
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        idempotencyKey: 'mm-fill:client1-pureMarketMaking:ex-1:buy:99:base',
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

  it('preserves persisted dual-account single-leg progress when fills update pnl state', async () => {
    await registerPooledSession({
      strategyKey: 'user1-client1-dualAccountVolume',
      strategyType: 'dualAccountVolume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: 10_000,
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
        dynamicRoleSwitching: false,
        publishedCycles: 0,
        completedCycles: 0,
        tradedQuoteVolume: 0,
        realizedPnlQuote: 0,
        inventoryBaseQty: 0,
        inventoryCostQuote: 0,
      },
    });

    mockStrategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: 'user1-client1-dualAccountVolume',
      parameters: {
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
        dynamicRoleSwitching: false,
        publishedCycles: 3,
        completedCycles: 2,
        tradedQuoteVolume: 420,
        realizedPnlQuote: 0,
        inventoryBaseQty: 0,
        inventoryCostQuote: 0,
      },
    });

    await service.routeFillForExchangePair('binance', 'BTC/USDT', {
      orderId: 'client1',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'client1:0',
      side: 'buy',
      price: '100',
      qty: '1',
      receivedAt: '2026-04-16T00:00:00.000Z',
    });

    expect(mockStrategyInstanceRepository.update).toHaveBeenCalledWith(
      { strategyKey: 'user1-client1-dualAccountVolume' },
      expect.objectContaining({
        parameters: expect.objectContaining({
          publishedCycles: 3,
          completedCycles: 2,
          tradedQuoteVolume: 420,
          inventoryBaseQty: 1,
          inventoryCostQuote: 100,
          realizedPnlQuote: 0,
        }),
      }),
    );

    const executor = executorRegistry.getExecutor('binance', 'BTC/USDT');

    expect(executor?.getSession('client1')).toEqual(
      expect.objectContaining({
        tradedQuoteVolume: 420,
        params: expect.objectContaining({
          tradedQuoteVolume: 420,
          inventoryBaseQty: 1,
          inventoryCostQuote: 100,
        }),
      }),
    );
  });

  it('updates dual-account fill progress without publishing taker intents from maker fill deltas', async () => {
    const params = {
      exchangeName: 'binance',
      symbol: 'BTC/USDT',
      baseIncrementPercentage: 0.1,
      baseIntervalTime: 10,
      baseTradeAmount: 1,
      numTrades: 5,
      userId: 'user1',
      clientId: 'client1',
      pricePushRate: 0,
      executionCategory: 'clob_cex' as const,
      executionVenue: 'cex' as const,
      makerAccountLabel: 'maker',
      takerAccountLabel: 'taker',
      publishedCycles: 1,
      completedCycles: 0,
      tradedQuoteVolume: 0,
      activeCycle: {
        cycleId: 'cycle-1',
        tickId: '2026-04-16T00:00:00.000Z',
        orderId: 'client1:cycle:1',
        makerSide: 'buy' as const,
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        price: '100',
        requestedQty: '1',
        makerFilledQty: '0',
        takerFilledQty: '0',
      },
    };

    mockStrategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: 'user1-client1-dualAccountVolume',
      parameters: params,
    });
    exchangeOrderTrackerService.getByExchangeOrderId.mockImplementation(
      (_exchange: string, exchangeOrderId: string, accountLabel?: string) =>
        exchangeOrderId === 'maker-ex-1' && accountLabel === 'maker'
          ? {
              orderId: 'client1:cycle:1',
              strategyKey: 'user1-client1-dualAccountVolume',
              exchange: 'binance',
              accountLabel: 'maker',
              pair: 'BTC/USDT',
              exchangeOrderId: 'maker-ex-1',
              side: 'buy',
              price: '100',
              qty: '1',
              status: 'partially_filled',
              role: 'maker',
              createdAt: '2026-04-16T00:00:00.000Z',
              updatedAt: '2026-04-16T00:00:00.000Z',
            }
          : undefined,
    );

    await registerPooledSession({
      strategyKey: 'user1-client1-dualAccountVolume',
      strategyType: 'dualAccountVolume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: 10_000,
      params,
    });

    await service.routeFillForExchangePair('binance', 'BTC/USDT', {
      orderId: 'client1',
      exchangeOrderId: 'maker-ex-1',
      accountLabel: 'maker',
      side: 'buy',
      price: '100',
      qty: '0.4',
      receivedAt: '2026-04-16T00:00:01.000Z',
    });

    await service.routeFillForExchangePair('binance', 'BTC/USDT', {
      orderId: 'client1',
      exchangeOrderId: 'maker-ex-1',
      accountLabel: 'maker',
      side: 'buy',
      price: '100',
      qty: '0.6',
      receivedAt: '2026-04-16T00:00:02.000Z',
    });

    expect(executorOrchestratorService.dispatchActions).not.toHaveBeenCalled();

    const executor = executorRegistry.getExecutor('binance', 'BTC/USDT');

    expect(executor?.getSession('client1')).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          activeCycle: expect.objectContaining({
            makerFilledQty: '1',
            takerFilledQty: '0',
          }),
        }),
      }),
    );
  });

  it('counts traded quote volume only from tracked taker fills', async () => {
    const params = {
      exchangeName: 'binance',
      symbol: 'BTC/USDT',
      baseIncrementPercentage: 0.1,
      baseIntervalTime: 10,
      baseTradeAmount: 1,
      numTrades: 5,
      userId: 'user1',
      clientId: 'client1',
      pricePushRate: 0,
      executionCategory: 'clob_cex' as const,
      executionVenue: 'cex' as const,
      makerAccountLabel: 'maker',
      takerAccountLabel: 'taker',
      publishedCycles: 1,
      completedCycles: 0,
      tradedQuoteVolume: 0,
      inventoryBaseQty: 0.4,
      inventoryCostQuote: 40,
      realizedPnlQuote: 0,
      activeCycle: {
        cycleId: 'cycle-1',
        tickId: '2026-04-16T00:00:00.000Z',
        orderId: 'client1:cycle:1',
        makerSide: 'buy' as const,
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        price: '100',
        requestedQty: '1',
        makerFilledQty: '0.4',
        takerFilledQty: '0',
      },
    };

    mockStrategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: 'user1-client1-dualAccountVolume',
      parameters: params,
    });
    exchangeOrderTrackerService.getByExchangeOrderId.mockImplementation(
      (_exchange: string, exchangeOrderId: string, accountLabel?: string) =>
        exchangeOrderId === 'taker-ex-1' && accountLabel === 'taker'
          ? {
              orderId: 'client1:cycle:1',
              strategyKey: 'user1-client1-dualAccountVolume',
              exchange: 'binance',
              accountLabel: 'taker',
              pair: 'BTC/USDT',
              exchangeOrderId: 'taker-ex-1',
              side: 'sell',
              price: '100',
              qty: '0.4',
              status: 'filled',
              role: 'taker',
              createdAt: '2026-04-16T00:00:00.000Z',
              updatedAt: '2026-04-16T00:00:00.000Z',
            }
          : undefined,
    );

    await registerPooledSession({
      strategyKey: 'user1-client1-dualAccountVolume',
      strategyType: 'dualAccountVolume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: 10_000,
      params,
    });

    await service.routeFillForExchangePair('binance', 'BTC/USDT', {
      orderId: 'client1',
      exchangeOrderId: 'taker-ex-1',
      accountLabel: 'taker',
      side: 'sell',
      price: '100',
      qty: '0.4',
      receivedAt: '2026-04-16T00:00:03.000Z',
    });

    expect(mockStrategyInstanceRepository.update).toHaveBeenCalledWith(
      { strategyKey: 'user1-client1-dualAccountVolume' },
      expect.objectContaining({
        parameters: expect.objectContaining({
          tradedQuoteVolume: 40,
          inventoryBaseQty: 0,
          inventoryCostQuote: 0,
          realizedPnlQuote: 0,
          activeCycle: expect.objectContaining({
            takerFilledQty: '0.4',
          }),
        }),
      }),
    );
  });

  it('finalizes settled dual-account cycles only after all tracked orders clear', async () => {
    const params = {
      exchangeName: 'binance',
      symbol: 'BTC/USDT',
      baseIncrementPercentage: 0.1,
      baseIntervalTime: 10,
      baseTradeAmount: 1,
      numTrades: 5,
      userId: 'user1',
      clientId: 'client1',
      pricePushRate: 0,
      executionCategory: 'clob_cex' as const,
      executionVenue: 'cex' as const,
      makerAccountLabel: 'maker',
      takerAccountLabel: 'taker',
      publishedCycles: 1,
      completedCycles: 0,
      tradedQuoteVolume: 40,
      activeCycle: {
        cycleId: 'cycle-1',
        tickId: '2026-04-16T00:00:00.000Z',
        orderId: 'client1:cycle:1',
        makerSide: 'buy' as const,
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        price: '100',
        requestedQty: '1',
        makerFilledQty: '0.4',
        takerFilledQty: '0.4',
      },
    };
    const buildActionsSpy = jest
      .spyOn(service, 'buildDualAccountVolumeActions')
      .mockResolvedValue([]);
    const session = await registerPooledSession({
      strategyKey: 'user1-client1-dualAccountVolume',
      strategyType: 'dualAccountVolume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: 10_000,
      params,
    });

    mockStrategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: 'user1-client1-dualAccountVolume',
      parameters: params,
    });
    exchangeOrderTrackerService.getTrackedOrders.mockReturnValue([]);

    await service.buildDualAccountVolumeSessionActions(
      session as any,
      '2026-04-16T00:00:05.000Z',
    );

    expect(mockStrategyInstanceRepository.update).toHaveBeenCalledWith(
      { strategyKey: 'user1-client1-dualAccountVolume' },
      expect.objectContaining({
        parameters: expect.objectContaining({
          completedCycles: 1,
          activeCycle: undefined,
        }),
      }),
    );

    buildActionsSpy.mockRestore();
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
        runtimeInstanceKey: strategyKey,
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
        runtimeInstanceKey: strategyKey,
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
        status: 'running',
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
        status: 'running',
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
        dynamicRoleSwitching: false,
        publishedCycles: 0,
        completedCycles: 0,
      } as any,
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toEqual([]);
  });

  it('reduces dual-account volume qty to fit live balances', async () => {
    strategyMarketDataProviderService.getTrackedBestBidAsk = jest
      .fn()
      .mockReturnValue({
        bestBid: 100,
        bestAsk: 101,
      });
    setCachedBalances({
      maker: { BTC: 10, USDT: 25 },
      taker: { BTC: 0.15, USDT: 1000 },
    });
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const actions = await service.buildDualAccountVolumeActions(
      'dual-key',
      {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 0.4,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        postOnlySide: 'buy',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        dynamicRoleSwitching: false,
        publishedCycles: 0,
        completedCycles: 0,
      } as any,
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toEqual([
      expect.objectContaining({
        qty: '0.15',
        accountLabel: 'maker',
        metadata: expect.objectContaining({
          makerAccountLabel: 'maker',
          takerAccountLabel: 'taker',
          requestedQty: '0.4',
          effectiveQty: '0.15',
        }),
      }),
    ]);
    jest.restoreAllMocks();
  });

  it('reserves a fee buffer before publishing a quote-limited dual-account cycle', async () => {
    strategyMarketDataProviderService.getTrackedBestBidAsk = jest
      .fn()
      .mockReturnValue({
        bestBid: 100,
        bestAsk: 101,
      });
    setCachedBalances({
      maker: { BTC: 10, USDT: 100.2 },
      taker: { BTC: 10, USDT: 1000 },
    });
    jest.spyOn(Math, 'random').mockReturnValue(0);

    const actions = await service.buildDualAccountVolumeActions(
      'dual-key',
      {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 2,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        postOnlySide: 'buy',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        dynamicRoleSwitching: false,
        publishedCycles: 0,
        completedCycles: 0,
      } as any,
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual(
      expect.objectContaining({
        accountLabel: 'maker',
        qty: '1.000998',
        metadata: expect.objectContaining({
          makerAccountLabel: 'maker',
          takerAccountLabel: 'taker',
          requestedQty: '2',
          effectiveQty: '1.000998',
        }),
      }),
    );
    jest.restoreAllMocks();
  });

  it('builds a rebalance IOC order when no dual-account side is tradable', async () => {
    strategyMarketDataProviderService.getTrackedBestBidAsk = jest
      .fn()
      .mockReturnValue({
        bestBid: 100,
        bestAsk: 101,
      });
    setCachedBalances({
      maker: { BTC: 0, USDT: 1000 },
      taker: { BTC: 0, USDT: 500 },
    });
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const actions = await service.buildDualAccountVolumeActions(
      'dual-key',
      {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseIncrementPercentage: 0.1,
        baseIntervalTime: 10,
        baseTradeAmount: 0.4,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        postOnlySide: 'buy',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        dynamicRoleSwitching: false,
        publishedCycles: 0,
        completedCycles: 0,
      } as any,
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toEqual([
      expect.objectContaining({
        side: 'buy',
        qty: '0.4',
        accountLabel: 'maker',
        postOnly: false,
        timeInForce: 'IOC',
        metadata: expect.objectContaining({
          role: 'rebalance',
          rebalance: true,
          rebalanceReason: 'no_tradable_side',
          rebalanceAccountLabel: 'maker',
          restoredSide: 'sell',
          configuredMakerAccountLabel: 'maker',
          configuredTakerAccountLabel: 'taker',
        }),
      }),
    ]);
    expect(balanceStateCacheService.getBalance).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('marks repair mode when a dual-account cycle settles with mismatched fills', async () => {
    const nextParams = await (service as any).finalizeSettledDualAccountCycle(
      { strategyKey: 'dual-key' },
      {
        completedCycles: 0,
        activeCycle: {
          cycleId: 'cycle-mismatch',
          tickId: 'tick-1',
          orderId: 'order-1',
          makerSide: 'buy',
          makerAccountLabel: 'maker',
          takerAccountLabel: 'taker',
          price: '100',
          requestedQty: '1',
          makerFilledQty: '0.4',
          takerFilledQty: '0.2',
          matchedFilledQty: '0.2',
          matchedQuoteVolume: '20',
        },
      },
    );

    expect(nextParams.completedCycles).toBe(0);
    expect(nextParams.repairRequired).toBe(true);
    expect(nextParams.repairReason).toBe('paired_fill_mismatch');
  });

  it('accumulates matched quote volume when a dual-account cycle settles with symmetric fills', async () => {
    const nextParams = await (service as any).finalizeSettledDualAccountCycle(
      { strategyKey: 'dual-key' },
      {
        completedCycles: 0,
        totalMatchedBaseVolume: 0,
        totalMatchedQuoteVolume: 0,
        activeCycle: {
          cycleId: 'cycle-1',
          tickId: 'tick-1',
          orderId: 'order-1',
          makerSide: 'buy',
          makerAccountLabel: 'maker',
          takerAccountLabel: 'taker',
          price: '100',
          requestedQty: '1',
          makerFilledQty: '0.4',
          takerFilledQty: '0.4',
          matchedFilledQty: '0.4',
          matchedQuoteVolume: '40',
        },
      },
    );

    expect(nextParams.completedCycles).toBe(1);
    expect(nextParams.totalMatchedBaseVolume).toBe(0.4);
    expect(nextParams.totalMatchedQuoteVolume).toBe(40);
    expect(nextParams.activeCycle).toBeUndefined();
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

  it('uses order-scoped ledger balances for pure market making inventory ratio', async () => {
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([]),
    };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);
    balanceLedgerService.getExistingBalance.mockImplementation(
      async (_orderId: string, assetId: string) => {
        if (assetId === 'BTC') {
          return { total: '2' };
        }

        if (assetId === 'USDT') {
          return { total: '100' };
        }

        return null;
      },
    );

    await service.buildPureMarketMakingActions(
      'order-1-pureMarketMaking',
      {
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
        currentBaseRatio: 0.1,
      },
      '2026-03-11T00:00:00.000Z',
    );

    expect(balanceLedgerService.getExistingBalance).toHaveBeenCalledWith(
      'order-1',
      'BTC',
    );
    expect(balanceLedgerService.getExistingBalance).toHaveBeenCalledWith(
      'order-1',
      'USDT',
    );
    expect(
      (service as any).quoteExecutorManagerService.buildQuotes,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        currentBaseRatio: 200 / 300,
      }),
    );
  });

  it('uses order-scoped ledger balances for pure market making quote validation', async () => {
    setCachedBalances({
      '2': { XIN: 0.02 },
    });
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(
      59.635,
    );
    strategyMarketDataProviderService.getTrackedBestBidAsk.mockReturnValue({
      bestBid: 59.51,
      bestAsk: 59.76,
    });
    balanceLedgerService.getExistingBalance.mockImplementation(
      async (_orderId: string, assetId: string) => {
        if (assetId === 'XIN') {
          return { available: '0.02', total: '0.02' };
        }

        if (assetId === 'USDT') {
          return { available: '1.193', total: '1.193' };
        }

        return null;
      },
    );
    exchangeConnectorAdapterService.loadTradingRules.mockResolvedValue({
      amountMin: 0.001,
      costMin: 1,
      makerFee: 0,
    });

    const actions = await service.buildPureMarketMakingActions(
      'mm-order-1-pureMarketMaking',
      {
        userId: 'user-1',
        clientId: 'mm-order-1',
        marketMakingOrderId: 'mm-order-1',
        pair: 'XIN/USDT',
        exchangeName: 'mexc',
        accountLabel: '2',
        bidSpread: 0.0045,
        askSpread: 0.0045,
        orderAmount: 0.02,
        orderRefreshTime: 1000,
        numberOfLayers: 1,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
      },
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'CREATE_LIMIT_ORDER', side: 'buy' }),
        expect.objectContaining({ type: 'CREATE_LIMIT_ORDER', side: 'sell' }),
      ]),
    );
    expect(balanceStateCacheService.getBalance).not.toHaveBeenCalledWith(
      'mexc',
      '2',
      'USDT',
    );
    expect(balanceLedgerService.getExistingBalance).toHaveBeenCalledWith(
      'mm-order-1',
      'USDT',
    );
  });

  it('does not apply a maker fee spread floor when ccxt reports zero maker fee', async () => {
    (service as any).exchangeInitService.getExchange = jest
      .fn()
      .mockReturnValue({
        id: 'mexc',
        markets: {
          'BTC/USDT': {
            maker: 0,
          },
        },
        fees: {
          trading: {
            maker: 0,
          },
        },
      });
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);
    strategyMarketDataProviderService.getTrackedBestBidAsk.mockReturnValue({
      bestBid: 99,
      bestAsk: 101,
    });
    balanceLedgerService.getExistingBalance.mockImplementation(
      async (_orderId: string, assetId: string) => {
        if (assetId === 'BTC') {
          return { available: '1', total: '1' };
        }

        if (assetId === 'USDT') {
          return { available: '1000', total: '1000' };
        }

        return null;
      },
    );

    const actions = await service.buildPureMarketMakingActions(
      'mm-order-1-pureMarketMaking',
      {
        userId: 'user-1',
        clientId: 'mm-order-1',
        marketMakingOrderId: 'mm-order-1',
        pair: 'BTC/USDT',
        exchangeName: 'mexc',
        bidSpread: 0.001,
        askSpread: 0.001,
        orderAmount: 1,
        orderRefreshTime: 1000,
        numberOfLayers: 1,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
      },
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'CREATE_LIMIT_ORDER', side: 'buy' }),
        expect.objectContaining({ type: 'CREATE_LIMIT_ORDER', side: 'sell' }),
      ]),
    );
  });

  it('forces one PMM layer when side budgets are below the layering threshold', async () => {
    setCachedBalances({
      default: { BTC: 0.5, USDT: 50 },
      maker: { BTC: 10, USDT: 1000 },
      taker: { BTC: 10, USDT: 1000 },
    });
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([]),
    };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    await service.buildPureMarketMakingActions(
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
        numberOfLayers: 3,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
        adaptiveSizeEnabled: true,
        layeringMinBudgetMultiple: 10,
      },
      '2026-03-11T00:00:00.000Z',
    );

    expect(
      (service as any).quoteExecutorManagerService.buildQuotes,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        numberOfLayers: 1,
      }),
    );
  });

  it('treats quantity drift as outside PMM refresh tolerance', () => {
    const withinTolerance = (service as any).isQuoteWithinTolerance(
      {
        side: 'buy',
        price: '99',
        qty: '1',
      },
      {
        side: 'buy',
        price: '99.5',
        qty: '2',
      },
      new BigNumber(0.1),
    );

    expect(withinTolerance).toBe(false);
  });

  it('updates PMM cadence from volatility when adaptive refresh is enabled', async () => {
    await registerPooledSession({
      strategyKey: 'order-1-pureMarketMaking',
      strategyType: 'pureMarketMaking',
      userId: 'user-1',
      clientId: 'order-1',
      cadenceMs: 10000,
      params: {
        userId: 'user-1',
        clientId: 'order-1',
        pair: 'BTC/USDT',
        exchangeName: 'binance',
      },
    });
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([]),
    };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);
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
        realizedVolatility: 0.005,
        imbalance: null,
      },
    );

    await service.buildPureMarketMakingActions(
      'order-1-pureMarketMaking',
      {
        userId: 'user-1',
        clientId: 'order-1',
        pair: 'BTC/USDT',
        exchangeName: 'binance',
        bidSpread: 0.01,
        askSpread: 0.01,
        orderAmount: 1,
        orderRefreshTime: 10000,
        numberOfLayers: 1,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
        adaptiveRefreshEnabled: true,
        refreshMinMs: 1000,
        refreshMaxMs: 10000,
        refreshVolPivot: 0.01,
      },
      '2026-03-11T00:00:00.000Z',
    );

    expect(
      (service as any).sessions.get('order-1-pureMarketMaking').cadenceMs,
    ).toBe(5500);
  });

  it('cancels live PMM orders and skips creates when adaptive market data is unsafe', async () => {
    exchangeOrderTrackerService.getActiveSlotOrders.mockReturnValue([
      {
        exchangeOrderId: 'open-buy-1',
        side: 'buy',
        price: '99',
        qty: '1',
        slotKey: 'layer-1-buy',
        status: 'open',
      },
    ]);
    exchangeOrderTrackerService.getLiveOrders.mockReturnValue([
      {
        exchangeOrderId: 'open-buy-1',
        side: 'buy',
        price: '99',
        qty: '1',
        slotKey: 'layer-1-buy',
        status: 'open',
      },
    ]);
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);
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
      },
    );

    const actions = await service.buildPureMarketMakingActions(
      'order-1-pureMarketMaking',
      {
        userId: 'user-1',
        clientId: 'order-1',
        pair: 'BTC/USDT',
        exchangeName: 'binance',
        bidSpread: 0.01,
        askSpread: 0.01,
        orderAmount: 1,
        orderRefreshTime: 10000,
        numberOfLayers: 1,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
        volBasedSpread: true,
      },
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      type: 'CANCEL_ORDER',
      mixinOrderId: 'open-buy-1',
    });
  });

  it('cancels live PMM orders and skips creates when order reservation is paused', async () => {
    balanceLedgerService.isReservationPaused.mockImplementation(
      (_orderId: string, assetId: string) => assetId === 'USDT',
    );
    exchangeOrderTrackerService.getActiveSlotOrders.mockReturnValue([
      {
        exchangeOrderId: 'open-sell-1',
        side: 'sell',
        price: '101',
        qty: '1',
        slotKey: 'layer-1-sell',
        status: 'open',
      },
    ]);
    exchangeOrderTrackerService.getLiveOrders.mockReturnValue([
      {
        exchangeOrderId: 'open-sell-1',
        side: 'sell',
        price: '101',
        qty: '1',
        slotKey: 'layer-1-sell',
        status: 'open',
      },
    ]);
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    const actions = await service.buildPureMarketMakingActions(
      'order-1-pureMarketMaking',
      {
        userId: 'user-1',
        clientId: 'order-1',
        marketMakingOrderId: 'mm-order-1',
        pair: 'BTC/USDT',
        exchangeName: 'binance',
        bidSpread: 0.01,
        askSpread: 0.01,
        orderAmount: 1,
        orderRefreshTime: 10000,
        numberOfLayers: 1,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
      },
      '2026-03-11T00:00:00.000Z',
    );

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      type: 'CANCEL_ORDER',
      mixinOrderId: 'open-sell-1',
    });
    expect(balanceLedgerService.isReservationPaused).toHaveBeenCalledWith(
      'mm-order-1',
      'USDT',
    );
  });

  it('uses conservative PMM warmup quotes when adaptive signal samples are not ready', async () => {
    const buildQuotes = jest.fn().mockReturnValue([]);

    (service as any).quoteExecutorManagerService = { buildQuotes };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);
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
        imbalance: 0.8,
      },
    );

    await service.buildPureMarketMakingActions(
      'order-1-pureMarketMaking',
      {
        userId: 'user-1',
        clientId: 'order-1',
        pair: 'BTC/USDT',
        exchangeName: 'binance',
        bidSpread: 0.01,
        askSpread: 0.01,
        orderAmount: 1,
        orderRefreshTime: 10000,
        numberOfLayers: 3,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
        volBasedSpread: true,
        adaptiveSizeEnabled: true,
        imbalanceSkewFactor: 0.01,
        warmupSpread: 0.05,
        warmupSizeRatio: 0.2,
      },
      '2026-03-11T00:00:00.000Z',
    );

    expect(buildQuotes).toHaveBeenCalledWith(
      expect.objectContaining({
        numberOfLayers: 1,
        bidSpread: 0.05,
        askSpread: 0.05,
        orderAmount: '0.2',
        volBasedSpread: false,
        realizedVolatility: null,
        orderBookImbalance: null,
        imbalanceSkewFactor: 0,
      }),
    );
  });

  it('passes side recovery adjustments after toxicity cooldown expires', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(5_500);
    const buildQuotes = jest.fn().mockReturnValue([]);

    (service as any).quoteExecutorManagerService = { buildQuotes };
    (service as any).pmmMarkoutEvaluatorService = {
      evaluateDue: jest.fn(),
      getToxicity: jest.fn().mockReturnValue({
        buyScore: 0,
        sellScore: 0,
        buyPausedUntilMs: null,
        sellPausedUntilMs: null,
        buyLastPausedUntilMs: 5_000,
        sellLastPausedUntilMs: null,
      }),
    };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    await service.buildPureMarketMakingActions(
      'order-1-pureMarketMaking',
      {
        userId: 'user-1',
        clientId: 'order-1',
        pair: 'BTC/USDT',
        exchangeName: 'binance',
        bidSpread: 0.01,
        askSpread: 0.01,
        orderAmount: 1,
        orderRefreshTime: 10000,
        numberOfLayers: 1,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
        adverseMarkoutGuardBps: 100,
        adverseMarkoutCooldownMs: 0,
        adverseMarkoutRecoveryMs: 1000,
        adverseMarkoutRecoverySizeRatio: 0.5,
      },
      '2026-03-11T00:00:00.000Z',
    );

    expect(buildQuotes).toHaveBeenCalledWith(
      expect.objectContaining({
        buyRecoveryWidenBps: 50,
        sellRecoveryWidenBps: 0,
        buyRecoverySizeRatio: 0.75,
        sellRecoverySizeRatio: 1,
      }),
    );
    nowSpy.mockRestore();
  });

  it('widens PMM spreads and slows cadence from runtime pressure', async () => {
    await registerPooledSession({
      strategyKey: 'order-1-pureMarketMaking',
      strategyType: 'pureMarketMaking',
      userId: 'user-1',
      clientId: 'order-1',
      cadenceMs: 1000,
      params: {
        userId: 'user-1',
        clientId: 'order-1',
        pair: 'BTC/USDT',
        exchangeName: 'binance',
      },
    });
    const buildQuotes = jest.fn().mockReturnValue([]);

    (service as any).quoteExecutorManagerService = { buildQuotes };
    (service as any).runtimeObservationService = {
      getPressure: jest.fn().mockReturnValue({
        strategyKey: 'order-1-pureMarketMaking',
        windowMs: 60000,
        rejectCount: 3,
        postOnlyRejectCount: 2,
        rateLimitCount: 1,
      }),
    };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    await service.buildPureMarketMakingActions(
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
        refreshMaxMs: 12000,
        postOnlyRejectThreshold: 2,
        postOnlyRejectWidenBps: 10,
        rateLimitPressureThreshold: 1,
      },
      '2026-03-11T00:00:00.000Z',
    );

    expect(buildQuotes).toHaveBeenCalledWith(
      expect.objectContaining({
        bidSpread: 0.011,
        askSpread: 0.011,
      }),
    );
    expect(
      (service as any).sessions.get('order-1-pureMarketMaking').cadenceMs,
    ).toBe(12000);
  });

  it('persists adaptive PMM decision snapshot metadata to execution history', async () => {
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([]),
    };
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);
    strategyMarketDataProviderService.getAdaptivePmmSignalSnapshot.mockReturnValue(
      {
        freshness: {
          status: 'fresh',
          ageMs: 10,
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
        realizedVolatility: 0.005,
        imbalance: null,
        imbalanceDepthNotional: null,
      },
    );

    await service.buildPureMarketMakingActions(
      'order-1-pureMarketMaking',
      {
        userId: 'user-1',
        clientId: 'order-1',
        marketMakingOrderId: 'mm-order-1',
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
        volBasedSpread: true,
      },
      '2026-03-11T00:00:00.000Z',
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockStrategyExecutionHistoryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        clientId: 'order-1',
        exchange: 'binance',
        pair: 'BTC/USDT',
        strategyType: 'pureMarketMaking',
        runtimeInstanceKey: 'order-1-pureMarketMaking',
        orderId: 'mm-order-1',
        status: 'quote_build',
        metadata: expect.objectContaining({
          event: 'adaptive_pmm.decision',
          reason: 'quote_build',
          freshness: 'fresh',
          realizedVolatility: 0.005,
        }),
      }),
    );
  });

  it('caps PMM cancel intents by per-second cancel budget', async () => {
    (service as any).quoteExecutorManagerService = {
      buildQuotes: jest.fn().mockReturnValue([]),
    };
    exchangeOrderTrackerService.getActiveSlotOrders.mockReturnValue([
      {
        side: 'buy',
        price: '99',
        qty: '1',
        status: 'open',
        slotKey: 'layer-1-buy',
        exchangeOrderId: 'buy-1',
      },
      {
        side: 'sell',
        price: '101',
        qty: '1',
        status: 'open',
        slotKey: 'layer-1-sell',
        exchangeOrderId: 'sell-1',
      },
    ]);
    strategyMarketDataProviderService.getReferencePrice.mockResolvedValue(100);

    const actions = await service.buildPureMarketMakingActions(
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
        cancelBudgetPerSec: 1,
      },
      '2026-03-11T00:00:00.000Z',
    );

    expect(
      actions.filter((action) => action.type === 'CANCEL_ORDER'),
    ).toHaveLength(1);
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

    setCachedBalances({
      default: { BTC: 0, USDT: 1 },
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
    setCachedBalances({
      default: { BTC: 0, USDT: 1000 },
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
});
