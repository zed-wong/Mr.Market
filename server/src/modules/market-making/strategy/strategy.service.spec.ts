/* eslint-disable @typescript-eslint/no-explicit-any */
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ArbitrageHistory } from 'src/common/entities/market-making/arbitrage-order.entity';
import { MarketMakingHistory } from 'src/common/entities/market-making/market-making-order.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';

import { PerformanceService } from '../performance/performance.service';
import { DexVolumeStrategyService } from './dex-volume.strategy.service';
import { PureMarketMakingStrategyDto } from './strategy.dto';
import { StrategyService } from './strategy.service';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';
import { StrategyIntentStoreService } from './strategy-intent-store.service';

class PerformanceServiceMock {
  recordPerformance = jest.fn();
}

class ExchangeInitServiceMock {
  getExchange(exchangeName: string): any {
    if (exchangeName === 'unknownExchange') {
      throw new InternalServerErrorException('Exchange not configured');
    }

    return {
      id: exchangeName,
      name: exchangeName,
      fetchOrderBook: jest.fn().mockResolvedValue({
        bids: [[100, 10]],
        asks: [[101, 10]],
      }),
      fetchTicker: jest.fn().mockResolvedValue({ last: 100.5 }),
    };
  }

  getSupportedExchanges(): string[] {
    return ['bitfinex', 'mexc', 'binance'];
  }
}

describe('StrategyService', () => {
  let service: StrategyService;
  let exchangeInitService: ExchangeInitService;
  let strategyIntentExecutionService: {
    consumeIntents: jest.Mock;
  };
  let strategyIntentStoreService: {
    upsertIntent: jest.Mock;
  };
  let dexVolumeStrategyService: {
    executeCycle: jest.Mock;
  };

  const mockOrderRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockArbitrageOrderRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockStrategyInstanceRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    strategyIntentExecutionService = {
      consumeIntents: jest.fn().mockResolvedValue(undefined),
    };
    strategyIntentStoreService = {
      upsertIntent: jest.fn().mockResolvedValue(undefined),
    };
    dexVolumeStrategyService = {
      executeCycle: jest.fn().mockResolvedValue({
        txHash: '0xabc',
        side: 'buy',
        amountIn: '1000000',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StrategyService,
        { provide: PerformanceService, useClass: PerformanceServiceMock },
        { provide: ExchangeInitService, useClass: ExchangeInitServiceMock },
        {
          provide: StrategyIntentExecutionService,
          useValue: strategyIntentExecutionService,
        },
        {
          provide: StrategyIntentStoreService,
          useValue: strategyIntentStoreService,
        },
        {
          provide: DexVolumeStrategyService,
          useValue: dexVolumeStrategyService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'strategy.intent_execution_driver') {
                return 'worker';
              }

              return defaultValue;
            }),
          },
        },
        {
          provide: getRepositoryToken(MarketMakingHistory),
          useValue: mockOrderRepository,
        },
        {
          provide: getRepositoryToken(ArbitrageHistory),
          useValue: mockArbitrageOrderRepository,
        },
        {
          provide: getRepositoryToken(StrategyInstance),
          useValue: mockStrategyInstanceRepository,
        },
      ],
    }).compile();

    service = module.get<StrategyService>(StrategyService);
    exchangeInitService = module.get(ExchangeInitService);

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
      '1-client1-pureMarketMaking',
    );

    expect(intents.length).toBe(2);
    expect(intents[0].type).toBe('CREATE_LIMIT_ORDER');
  });

  it('publishes intents without consuming synchronously when worker driver is enabled', async () => {
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

    expect(strategyIntentStoreService.upsertIntent).toHaveBeenCalledTimes(2);
    expect(
      strategyIntentExecutionService.consumeIntents,
    ).not.toHaveBeenCalled();
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

    const intents = service.getLatestIntentsForStrategy(
      '1-client1-pureMarketMaking',
    );

    expect(intents.some((intent) => intent.type === 'STOP_EXECUTOR')).toBe(
      true,
    );
  });

  it('falls back to ticker price when order book is empty', async () => {
    jest.spyOn(exchangeInitService, 'getExchange').mockReturnValue({
      id: 'bitfinex',
      fetchOrderBook: jest.fn().mockResolvedValue({ bids: [], asks: [] }),
      fetchTicker: jest.fn().mockResolvedValue({ last: 100 }),
    } as any);

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
      service.getLatestIntentsForStrategy('1-client1-pureMarketMaking'),
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
    expect(session.params.dexId).toBe('uniswapV3');
    expect(session.params.chainId).toBe(1);
  });

  it('executes dex volume cycle via dex service and increments executed trades', async () => {
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

    await service.onTick('2026-03-01T00:00:00.000Z');

    expect(dexVolumeStrategyService.executeCycle).toHaveBeenCalledTimes(1);
    expect(dexVolumeStrategyService.executeCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        dexId: 'uniswapV3',
        chainId: 1,
        side: 'buy',
      }),
    );
    expect(strategyIntentStoreService.upsertIntent).not.toHaveBeenCalled();
    expect(
      (service as any).sessions.get(strategyKey).params.executedTrades,
    ).toBe(1);

    dateNowSpy.mockRestore();
  });
});
