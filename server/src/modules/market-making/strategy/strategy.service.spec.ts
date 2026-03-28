/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';

import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { PerformanceService } from '../performance/performance.service';
import { PureMarketMakingStrategyDto } from './config/strategy.dto';
import { TimeIndicatorStrategyDto } from './config/timeIndicator.dto';
import { StrategyControllerRegistry } from './controllers/strategy-controller.registry';
import { StrategyMarketDataProviderService } from './data/strategy-market-data-provider.service';
import { ExecutorRegistry } from './execution/executor-registry';
import { ExecutorOrchestratorService } from './intent/executor-orchestrator.service';
import { StrategyService } from './strategy.service';

class PerformanceServiceMock {
  recordPerformance = jest.fn();
}

class ExchangeInitServiceMock {
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
}

describe('StrategyService', () => {
  let service: StrategyService;
  let executorRegistry: ExecutorRegistry;
  let exchangeInitService: ExchangeInitServiceMock;
  let executorOrchestratorService: {
    dispatchActions: jest.Mock;
  };
  let balanceLedgerService: {
    adjust: jest.Mock;
  };
  let strategyMarketDataProviderService: {
    getReferencePrice: jest.Mock;
    getBestBidAsk: jest.Mock;
    getOrderBook: jest.Mock;
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
    strategyType: 'pureMarketMaking' | 'volume' | 'timeIndicator';
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
    strategyMarketDataProviderService = {
      getReferencePrice: jest.fn().mockResolvedValue(100.5),
      getBestBidAsk: jest
        .fn()
        .mockResolvedValue({ bestBid: 100, bestAsk: 101 }),
      getOrderBook: jest.fn().mockResolvedValue({
        bids: [[100, 10]],
        asks: [[101, 10]],
      }),
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

    jest.clearAllMocks();
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
        'mm-fill:client1-pureMarketMaking:ex-1:client1:0:buy:100:0.5:0.5:base',
      refType: 'market_making_fill',
      refId: 'ex-1',
    });
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(2, {
      userId: '1',
      assetId: 'USDT',
      amount: '-50',
      idempotencyKey:
        'mm-fill:client1-pureMarketMaking:ex-1:client1:0:buy:100:0.5:0.5:quote',
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
          'mm-fill:client1-pureMarketMaking:ex-1:client1:0:buy:100:1.5:0.5:base',
      }),
    );
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        idempotencyKey:
          'mm-fill:client1-pureMarketMaking:ex-1:client1:0:buy:100:1.5:0.5:base',
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
        expect.objectContaining({ type: 'STOP_CONTROLLER' }),
      ]),
    );

    const intents = service.getLatestIntentsForStrategy(
      'client1-pureMarketMaking',
    );

    expect(intents.some((intent) => intent.type === 'STOP_CONTROLLER')).toBe(
      true,
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
        existingOpenOrdersBySide: {
          buy: 2,
          sell: 1,
        },
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
    expect(warnSpy).toHaveBeenCalledTimes(2);
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
