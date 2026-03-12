import { BadRequestException } from '@nestjs/common';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { Repository } from 'typeorm';

import { StrategyRuntimeDispatcherService } from '../execution/strategy-runtime-dispatcher.service';
import { StrategyConfigResolverService } from './strategy-config-resolver.service';

describe('StrategyConfigResolverService', () => {
  let service: StrategyConfigResolverService;
  let strategyDefinitionRepository: Pick<
    Repository<StrategyDefinition>,
    'findOne'
  >;
  const dispatcher = {
    toStrategyType: jest.fn((controllerType: string) => {
      if (controllerType === 'arbitrage') return 'arbitrage';
      if (controllerType === 'pureMarketMaking') return 'pureMarketMaking';
      if (controllerType === 'volume') return 'volume';
      throw new BadRequestException('Unsupported controllerType');
    }),
  } as unknown as StrategyRuntimeDispatcherService;
  const asStrategyDefinition = (
    value: Partial<StrategyDefinition>,
  ): StrategyDefinition => value as StrategyDefinition;

  beforeEach(() => {
    jest.clearAllMocks();
    strategyDefinitionRepository = {
      findOne: jest.fn(),
    };
    service = new StrategyConfigResolverService(
      strategyDefinitionRepository as Repository<StrategyDefinition>,
      dispatcher,
    );
  });

  it('reads controllerType and accepts executorType alias', () => {
    expect(
      service.getDefinitionControllerType({
        controllerType: 'arbitrage',
      } as Partial<StrategyDefinition>),
    ).toBe('arbitrage');
    expect(
      service.getDefinitionControllerType({
        executorType: 'volume',
      } as Partial<StrategyDefinition>),
    ).toBe('volume');
    expect(
      service.getDefinitionControllerType({
        controllerType: 'pure_market_making',
      } as Partial<StrategyDefinition>),
    ).toBe('pureMarketMaking');
  });

  it('throws when controller type missing', () => {
    expect(() =>
      service.getDefinitionControllerType({} as Partial<StrategyDefinition>),
    ).toThrow(BadRequestException);
  });

  it('merges config for pure market making with marketMakingOrderId override', () => {
    const result = service.resolveDefinitionStartConfig(
      asStrategyDefinition({
        key: 'pure-mm',
        enabled: true,
        controllerType: 'pureMarketMaking',
        defaultConfig: { pair: 'BTC/USDT', orderRefreshTime: 15000 },
        configSchema: {
          type: 'object',
          required: ['pair'],
          properties: {
            pair: { type: 'string' },
          },
        },
      }),
      {
        userId: 'u1',
        clientId: 'c1',
        marketMakingOrderId: 'order-1',
        config: { pair: 'ETH/USDT' },
      },
    );

    expect(result.strategyType).toBe('pureMarketMaking');
    expect(result.mergedConfig).toEqual(
      expect.objectContaining({
        pair: 'ETH/USDT',
        userId: 'u1',
        clientId: 'order-1',
        marketMakingOrderId: 'order-1',
      }),
    );
  });

  it('rejects disabled definition', () => {
    expect(() =>
      service.resolveDefinitionStartConfig(
        asStrategyDefinition({
          key: 'disabled',
          enabled: false,
          controllerType: 'volume',
          defaultConfig: {},
          configSchema: {},
        }),
        {
          userId: 'u1',
          clientId: 'c1',
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('can resolve start config for disabled definitions when enabled check is skipped', () => {
    const result = service.resolveDefinitionStartConfig(
      asStrategyDefinition({
        key: 'disabled',
        enabled: false,
        controllerType: 'pure_market_making',
        defaultConfig: {},
        configSchema: {
          type: 'object',
          required: ['pair', 'exchangeName', 'userId', 'clientId'],
          properties: {
            pair: { type: 'string' },
            exchangeName: { type: 'string' },
            userId: { type: 'string' },
            clientId: { type: 'string' },
          },
        },
      }),
      {
        userId: 'u1',
        clientId: 'c1',
        marketMakingOrderId: 'order-1',
        config: {
          pair: 'BTC/USDT',
          exchangeName: 'binance',
        },
      },
      { skipEnabledCheck: true },
    );

    expect(result.strategyType).toBe('pureMarketMaking');
    expect(result.mergedConfig).toEqual(
      expect.objectContaining({
        userId: 'u1',
        clientId: 'order-1',
        marketMakingOrderId: 'order-1',
      }),
    );
  });

  it('normalizes volume execution category from executionVenue alias', () => {
    const result = service.resolveDefinitionStartConfig(
      asStrategyDefinition({
        key: 'volume',
        enabled: true,
        controllerType: 'volume',
        defaultConfig: {
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          incrementPercentage: 0.1,
          intervalTime: 10,
          tradeAmount: 1,
          numTrades: 5,
          executionVenue: 'dex',
          dexId: 'uniswapV3',
          chainId: 1,
          tokenIn: '0x0000000000000000000000000000000000000001',
          tokenOut: '0x0000000000000000000000000000000000000002',
          feeTier: 3000,
        },
        configSchema: {
          type: 'object',
          required: ['exchangeName', 'symbol'],
          properties: {
            exchangeName: { type: 'string' },
            symbol: { type: 'string' },
          },
        },
      }),
      {
        userId: 'u1',
        clientId: 'c1',
      },
    );

    expect(result.strategyType).toBe('volume');
    expect(result.mergedConfig.executionCategory).toBe('amm_dex');
    expect(result.mergedConfig.executionVenue).toBe('dex');
  });

  it('validates schema constraints', () => {
    expect(() =>
      service.validateConfigAgainstSchema(
        { amount: -1 },
        {
          type: 'object',
          properties: {
            amount: { type: 'number', minimum: 0 },
          },
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('builds order snapshot payload from stored definition and overrides', async () => {
    strategyDefinitionRepository.findOne = jest.fn().mockResolvedValueOnce({
      id: 'definition-1',
      enabled: false,
      controllerType: 'pureMarketMaking',
      currentVersion: '2.1.0',
      defaultConfig: {
        bidSpread: 0.001,
        askSpread: 0.001,
        orderRefreshTime: 10000,
      },
      configSchema: {
        type: 'object',
        required: ['pair', 'exchangeName', 'userId', 'clientId'],
        properties: {
          pair: { type: 'string' },
          exchangeName: { type: 'string' },
          userId: { type: 'string' },
          clientId: { type: 'string' },
          bidSpread: { type: 'number' },
          askSpread: { type: 'number' },
          orderRefreshTime: { type: 'number' },
        },
      },
    } as unknown as StrategyDefinition);

    const result = await service.resolveForOrderSnapshot('definition-1', {
      pair: 'BTC/USDT',
      exchangeName: 'binance',
      userId: 'user-1',
      clientId: 'order-1',
      bidSpread: 0.0025,
    });

    expect(strategyDefinitionRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'definition-1' },
    });
    expect(result).toEqual({
      definitionVersion: '2.1.0',
      controllerType: 'pureMarketMaking',
      resolvedConfig: {
        bidSpread: 0.0025,
        askSpread: 0.001,
        orderRefreshTime: 10000,
        pair: 'BTC/USDT',
        exchangeName: 'binance',
        userId: 'user-1',
        clientId: 'order-1',
      },
    });
  });
});
