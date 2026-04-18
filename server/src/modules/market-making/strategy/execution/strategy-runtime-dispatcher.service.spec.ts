import { BadRequestException } from '@nestjs/common';

import {
  normalizeExecutionCategory,
  toLegacyExecutionVenue,
} from '../config/strategy-execution-category';
import { StrategyControllerRegistry } from '../controllers/strategy-controller.registry';
import { StrategyService } from '../strategy.service';
import { StrategyRuntimeDispatcherService } from './strategy-runtime-dispatcher.service';

function resolveVolumeExecutionVenue(
  config: Record<string, unknown>,
): 'cex' | 'dex' {
  if (config.executionCategory !== undefined) {
    const normalized = normalizeExecutionCategory(
      String(config.executionCategory),
    );

    return toLegacyExecutionVenue(normalized);
  }

  return String(config.executionVenue || '') === 'dex' ? 'dex' : 'cex';
}

function resolveVolumeExecutionCategory(
  config: Record<string, unknown>,
): string {
  return normalizeExecutionCategory(
    String(config.executionCategory || '') ||
      String(config.executionVenue || ''),
  );
}

function readNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : undefined;

  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function createMockStart(
  strategyService: Record<string, jest.Mock>,
  strategyType: string,
) {
  const startMap: Record<
    string,
    (config: Record<string, unknown>, svc: any) => Promise<void>
  > = {
    arbitrage: async (config, svc) => {
      await svc.startArbitrageStrategyForUser(
        config,
        Number(config.checkIntervalSeconds || 10),
        Number(config.maxOpenOrders || 1),
      );
    },
    pureMarketMaking: async (config, svc) => {
      await svc.executePureMarketMakingStrategy(config);
    },
    dualAccountVolume: async (config, svc) => {
      await svc.executeDualAccountVolumeStrategy(config);
    },
    dualAccountBestCapacityVolume: async (config, svc) => {
      await svc.executeDualAccountBestCapacityVolumeStrategy(config);
    },
    timeIndicator: async (config, svc) => {
      await svc.executeTimeIndicatorStrategy(config);
    },
    volume: async (config, svc) => {
      const executionVenue = resolveVolumeExecutionVenue(config);
      const executionCategory = resolveVolumeExecutionCategory(config);

      await svc.executeVolumeStrategy(
        readString(config.exchangeName),
        readString(config.symbol),
        readNumber(config.incrementPercentage) ??
          readNumber(config.baseIncrementPercentage) ??
          0,
        readNumber(config.intervalTime) ??
          readNumber(config.baseIntervalTime) ??
          10,
        readNumber(config.tradeAmount) ??
          readNumber(config.baseTradeAmount) ??
          0,
        readNumber(config.numTrades) ?? 1,
        readString(config.userId) || '',
        readString(config.clientId) || '',
        readNumber(config.pricePushRate) ?? 0,
        config.postOnlySide === 'buy' || config.postOnlySide === 'sell'
          ? config.postOnlySide
          : undefined,
        executionVenue,
        config.dexId === 'uniswapV3' || config.dexId === 'pancakeV3'
          ? config.dexId
          : undefined,
        readNumber(config.chainId),
        readString(config.tokenIn),
        readString(config.tokenOut),
        readNumber(config.feeTier),
        readNumber(config.slippageBps),
        readString(config.recipient),
        executionCategory,
      );
    },
  };

  const fn = startMap[strategyType];

  return fn ? fn : undefined;
}

describe('StrategyRuntimeDispatcherService', () => {
  let service: StrategyRuntimeDispatcherService;
  const strategyService = {
    startArbitrageStrategyForUser: jest.fn(),
    executePureMarketMakingStrategy: jest.fn(),
    executeDualAccountVolumeStrategy: jest.fn(),
    executeDualAccountBestCapacityVolumeStrategy: jest.fn(),
    executeTimeIndicatorStrategy: jest.fn(),
    executeVolumeStrategy: jest.fn(),
    stopStrategyForUser: jest.fn(),
  } as unknown as StrategyService;
  const strategyControllerRegistry = {
    getController: jest.fn((strategyType: string) => {
      const knownTypes = [
        'arbitrage',
        'pureMarketMaking',
        'dualAccountVolume',
        'dualAccountBestCapacityVolume',
        'volume',
        'timeIndicator',
      ];

      if (!knownTypes.includes(strategyType)) return undefined;
      const startFn = createMockStart(
        strategyService as unknown as Record<string, jest.Mock>,
        strategyType,
      );

      return { strategyType, ...(startFn ? { start: startFn } : {}) };
    }),
    listControllerTypes: jest.fn(() => [
      'arbitrage',
      'pureMarketMaking',
      'dualAccountVolume',
      'dualAccountBestCapacityVolume',
      'volume',
      'timeIndicator',
    ]),
  } as unknown as StrategyControllerRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StrategyRuntimeDispatcherService(
      strategyService,
      strategyControllerRegistry,
    );
  });

  it('maps controller type to strategy type', () => {
    expect(service.toStrategyType('arbitrage')).toBe('arbitrage');
    expect(service.toStrategyType('pureMarketMaking')).toBe('pureMarketMaking');
    expect(service.toStrategyType('pure_market_making')).toBe(
      'pureMarketMaking',
    );
    expect(service.toStrategyType('dual_account_volume')).toBe(
      'dualAccountVolume',
    );
    expect(service.toStrategyType('dual_account_best_capacity_volume')).toBe(
      'dualAccountBestCapacityVolume',
    );
    expect(service.toStrategyType('volume')).toBe('volume');
    expect(service.toStrategyType('time_indicator')).toBe('timeIndicator');
  });

  it('throws on unsupported controller type', () => {
    expect(() => service.toStrategyType('unknown')).toThrow(
      BadRequestException,
    );
  });

  it('maps legacy marketMaking alias to pureMarketMaking', () => {
    expect(service.mapStrategyTypeToController('marketMaking')).toBe(
      'pureMarketMaking',
    );
  });

  it('dispatches arbitrage start', async () => {
    await service.startByStrategyType('arbitrage', {
      pair: 'BTC/USDT',
      checkIntervalSeconds: 15,
      maxOpenOrders: 3,
    });

    expect(strategyService.startArbitrageStrategyForUser).toHaveBeenCalledWith(
      expect.objectContaining({ pair: 'BTC/USDT' }),
      15,
      3,
    );
  });

  it('dispatches pure market making start', async () => {
    await service.startByStrategyType('pureMarketMaking', {
      userId: 'u1',
      clientId: 'c1',
      pair: 'BTC/USDT',
    });

    expect(
      strategyService.executePureMarketMakingStrategy,
    ).toHaveBeenCalledWith(expect.objectContaining({ pair: 'BTC/USDT' }));
  });

  it('dispatches dual-account volume start', async () => {
    await service.startByStrategyType('dualAccountVolume', {
      exchangeName: 'binance',
      symbol: 'BTC/USDT',
      baseIncrementPercentage: 0.5,
      baseIntervalTime: 12,
      baseTradeAmount: 0.2,
      numTrades: 5,
      userId: 'u1',
      clientId: 'c1',
      pricePushRate: 0,
      makerAccountLabel: 'maker',
      takerAccountLabel: 'taker',
    });

    expect(
      strategyService.executeDualAccountVolumeStrategy,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeName: 'binance',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
      }),
    );
  });

  it('dispatches dual-account best-capacity volume start', async () => {
    await service.startByStrategyType('dualAccountBestCapacityVolume', {
      exchangeName: 'binance',
      symbol: 'BTC/USDT',
      baseIncrementPercentage: 0.5,
      baseIntervalTime: 12,
      baseTradeAmount: 0.2,
      numTrades: 5,
      userId: 'u1',
      clientId: 'c1',
      pricePushRate: 0,
      makerAccountLabel: 'maker',
      takerAccountLabel: 'taker',
    });

    expect(
      strategyService.executeDualAccountBestCapacityVolumeStrategy,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeName: 'binance',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
      }),
    );
  });

  it('dispatches volume start with fallback aliases', async () => {
    await service.startByStrategyType('volume', {
      exchangeName: 'binance',
      symbol: 'BTC/USDT',
      baseIncrementPercentage: 0.5,
      baseIntervalTime: 12,
      baseTradeAmount: 0.2,
      numTrades: 5,
      userId: 'u1',
      clientId: 'c1',
      pricePushRate: 0,
    });

    expect(strategyService.executeVolumeStrategy).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      0.5,
      12,
      0.2,
      5,
      'u1',
      'c1',
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
      'clob_cex',
    );
  });

  it('routes execution category amm_dex to dex venue', async () => {
    await service.startByStrategyType('volume', {
      exchangeName: 'binance',
      symbol: 'BTC/USDT',
      incrementPercentage: 0.5,
      intervalTime: 12,
      tradeAmount: 0.2,
      numTrades: 5,
      userId: 'u1',
      clientId: 'c1',
      pricePushRate: 0,
      executionCategory: 'amm_dex',
      dexId: 'uniswapV3',
      chainId: 1,
      tokenIn: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      feeTier: 3000,
    });

    expect(strategyService.executeVolumeStrategy).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      0.5,
      12,
      0.2,
      5,
      'u1',
      'c1',
      0,
      undefined,
      'dex',
      'uniswapV3',
      1,
      '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      3000,
      undefined,
      undefined,
      'amm_dex',
    );
  });

  it('dispatches stop via strategy service', async () => {
    await service.stopByStrategyType('volume', 'u1', 'c1');

    expect(strategyService.stopStrategyForUser).toHaveBeenCalledWith(
      'u1',
      'c1',
      'volume',
    );
  });

  it('passes clob_dex execution category to strategy service', async () => {
    await service.startByStrategyType('volume', {
      exchangeName: 'dydx',
      symbol: 'ETH/USDC',
      incrementPercentage: 0.1,
      intervalTime: 10,
      tradeAmount: 1,
      numTrades: 2,
      userId: 'u1',
      clientId: 'c1',
      pricePushRate: 0,
      executionCategory: 'clob_dex',
    });

    expect(strategyService.executeVolumeStrategy).toHaveBeenCalledWith(
      'dydx',
      'ETH/USDC',
      0.1,
      10,
      1,
      2,
      'u1',
      'c1',
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
    );
  });

  it('normalizes legacy dex venue to amm_dex category', async () => {
    await service.startByStrategyType('volume', {
      exchangeName: 'uniswapV3',
      symbol: 'ETH/USDC',
      incrementPercentage: 0.1,
      intervalTime: 10,
      tradeAmount: 1,
      numTrades: 2,
      userId: 'u1',
      clientId: 'c1',
      pricePushRate: 0,
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
});
