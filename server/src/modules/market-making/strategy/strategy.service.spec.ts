/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';

import { PerformanceService } from '../performance/performance.service';
import { ExecutorOrchestratorService } from './executor-orchestrator.service';
import { PureMarketMakingStrategyDto } from './strategy.dto';
import { StrategyService } from './strategy.service';
import { StrategyControllerRegistry } from './strategy-controller.registry';
import { StrategyMarketDataProviderService } from './strategy-market-data-provider.service';

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
  let executorOrchestratorService: {
    dispatchActions: jest.Mock;
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

  beforeEach(async () => {
    executorOrchestratorService = {
      dispatchActions: jest.fn(async (_strategyKey: string, actions: any[]) =>
        actions.map((action: any) => ({
          ...action,
          status: action.status || 'NEW',
        })),
      ),
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
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: getRepositoryToken(StrategyInstance),
          useValue: mockStrategyInstanceRepository,
        },
      ],
    }).compile();

    service = module.get<StrategyService>(StrategyService);

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

    (service as any).sessions.set(strategyKey, {
      runId: 'run-1',
      strategyKey,
      strategyType: 'pureMarketMaking',
      userId: '1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs,
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

    (service as any).sessions.set('a-strategy', {
      strategyKey: 'a-strategy',
      strategyType: 'pureMarketMaking',
      userId: 'u1',
      clientId: 'c1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs,
      params: {},
    });
    (service as any).sessions.set('b-strategy', {
      strategyKey: 'b-strategy',
      strategyType: 'pureMarketMaking',
      userId: 'u2',
      clientId: 'c2',
      cadenceMs: 2000,
      nextRunAtMs: nowMs,
      params: {},
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
          const activeB = (service as any).sessions.get('b-strategy');

          (service as any).sessions.set('b-strategy', {
            ...activeB,
            runId: 'run-b-new',
          });
        }
      });

    (service as any).sessions.set('a-strategy', {
      runId: 'run-a',
      strategyKey: 'a-strategy',
      strategyType: 'pureMarketMaking',
      userId: 'u1',
      clientId: 'c1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs,
      params: {},
    });
    (service as any).sessions.set('b-strategy', {
      runId: 'run-b-old',
      strategyKey: 'b-strategy',
      strategyType: 'pureMarketMaking',
      userId: 'u2',
      clientId: 'c2',
      cadenceMs: 2000,
      nextRunAtMs: nowMs,
      params: {},
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

    (service as any).sessions.set(strategyKey, {
      runId: 'run-1',
      strategyKey,
      strategyType: 'volume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs,
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

    (service as any).sessions.set(strategyKey, {
      runId: 'run-1',
      strategyKey,
      strategyType: 'volume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs,
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

    (service as any).sessions.set(strategyKey, {
      runId: 'run-1',
      strategyKey,
      strategyType: 'volume',
      userId: 'user1',
      clientId: 'client1',
      cadenceMs: 1000,
      nextRunAtMs: nowMs,
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
});
