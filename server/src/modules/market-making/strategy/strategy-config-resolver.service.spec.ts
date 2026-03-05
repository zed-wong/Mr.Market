import { BadRequestException } from '@nestjs/common';

import { StrategyConfigResolverService } from './strategy-config-resolver.service';
import { StrategyRuntimeDispatcherService } from './strategy-runtime-dispatcher.service';

describe('StrategyConfigResolverService', () => {
  let service: StrategyConfigResolverService;
  const dispatcher = {
    toStrategyType: jest.fn((controllerType: string) => {
      if (controllerType === 'arbitrage') return 'arbitrage';
      if (controllerType === 'pureMarketMaking') return 'pureMarketMaking';
      if (controllerType === 'volume') return 'volume';
      throw new BadRequestException('Unsupported controllerType');
    }),
  } as unknown as StrategyRuntimeDispatcherService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StrategyConfigResolverService(dispatcher);
  });

  it('reads controllerType and accepts executorType alias', () => {
    expect(
      service.getDefinitionControllerType({
        controllerType: 'arbitrage',
      } as any),
    ).toBe('arbitrage');
    expect(
      service.getDefinitionControllerType({ executorType: 'volume' } as any),
    ).toBe('volume');
  });

  it('throws when controller type missing', () => {
    expect(() => service.getDefinitionControllerType({} as any)).toThrow(
      BadRequestException,
    );
  });

  it('merges config for pure market making with marketMakingOrderId override', () => {
    const result = service.resolveDefinitionStartConfig(
      {
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
      } as any,
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
        {
          key: 'disabled',
          enabled: false,
          controllerType: 'volume',
          defaultConfig: {},
          configSchema: {},
        } as any,
        {
          userId: 'u1',
          clientId: 'c1',
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('normalizes volume execution category from executionVenue alias', () => {
    const result = service.resolveDefinitionStartConfig(
      {
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
      } as any,
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
});
