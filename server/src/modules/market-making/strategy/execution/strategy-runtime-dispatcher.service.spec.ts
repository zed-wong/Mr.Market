import { BadRequestException } from '@nestjs/common';

import { StrategyControllerRegistry } from '../controllers/strategy-controller.registry';
import { StrategyService } from '../strategy.service';
import { StrategyRuntimeDispatcherService } from './strategy-runtime-dispatcher.service';

describe('StrategyRuntimeDispatcherService', () => {
  let service: StrategyRuntimeDispatcherService;
  const strategyService = {
    executePureMarketMakingStrategy: jest.fn(),
    executeVolumeStrategy: jest.fn(),
    stopStrategyForUser: jest.fn(),
  } as unknown as StrategyService;
  const registry = {
    listControllerTypes: jest.fn(() => ['pureMarketMaking', 'volume']),
    getController: jest.fn((strategyType: string) => {
      if (strategyType === 'pureMarketMaking') {
        return {
          strategyType,
          start: async (config: unknown, svc: any) =>
            svc.executePureMarketMakingStrategy(config),
        };
      }
      if (strategyType === 'volume') {
        return {
          strategyType,
          start: async (config: any, svc: any) =>
            svc.executeVolumeStrategy(
              config.exchangeName,
              config.symbol,
              config.incrementPercentage ?? config.baseIncrementPercentage ?? 0,
              config.intervalTime ?? config.baseIntervalTime ?? 10,
              config.tradeAmount ?? config.baseTradeAmount ?? 0,
              config.numTrades ?? 1,
              config.userId ?? '',
              config.clientId ?? '',
              config.pricePushRate ?? 0,
              config.postOnlySide,
              config.executionCategory === 'amm_dex' ||
                config.executionVenue === 'dex'
                ? 'dex'
                : 'cex',
              config.dexId,
              config.chainId,
              config.tokenIn,
              config.tokenOut,
              config.feeTier,
              config.slippageBps,
              config.recipient,
              config.executionCategory ||
                (config.executionVenue === 'dex' ? 'amm_dex' : 'clob_cex'),
            ),
        };
      }
      return undefined;
    }),
  } as unknown as StrategyControllerRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StrategyRuntimeDispatcherService(strategyService, registry);
  });

  it('normalizes public controller aliases to runtime strategy types', () => {
    expect(service.toStrategyType('pure_market_making')).toBe(
      'pureMarketMaking',
    );
    expect(service.toStrategyType('marketMaking')).toBe('pureMarketMaking');
    expect(service.toStrategyType('volume')).toBe('volume');
    expect(service.mapStrategyTypeToController('marketMaking')).toBe(
      'pureMarketMaking',
    );
  });

  it('rejects unsupported controller types before dispatch', async () => {
    expect(() => service.toStrategyType('unknown')).toThrow(
      BadRequestException,
    );
    await expect(
      service.startByStrategyType('unknown' as any, {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('dispatches pure market making through the registered controller', async () => {
    await service.startByStrategyType('pureMarketMaking', {
      userId: 'u1',
      clientId: 'c1',
      pair: 'BTC/USDT',
    });

    expect(strategyService.executePureMarketMakingStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ pair: 'BTC/USDT' }),
    );
  });

  it('normalizes volume execution category while dispatching start', async () => {
    await service.startByStrategyType('volume', {
      exchangeName: 'uniswapV3',
      symbol: 'ETH/USDC',
      incrementPercentage: 0.1,
      intervalTime: 10,
      tradeAmount: 1,
      numTrades: 2,
      userId: 'u1',
      clientId: 'c1',
      executionVenue: 'dex',
      dexId: 'uniswapV3',
      chainId: 1,
      tokenIn: '0x0000000000000000000000000000000000000001',
      tokenOut: '0x0000000000000000000000000000000000000002',
      feeTier: 3000,
    });

    expect(strategyService.executeVolumeStrategy).toHaveBeenCalledWith(
      'uniswapV3',
      'ETH/USDC',
      0.1,
      10,
      1,
      2,
      'u1',
      'c1',
      0,
      undefined,
      'dex',
      'uniswapV3',
      1,
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
      3000,
      undefined,
      undefined,
      'amm_dex',
    );
  });

  it('stops using the requested strategy type without controller dispatch', async () => {
    await service.stopByStrategyType('pureMarketMaking', 'u1', 'c1');

    expect(strategyService.stopStrategyForUser).toHaveBeenCalledWith(
      'u1',
      'c1',
      'pureMarketMaking',
    );
  });
});
