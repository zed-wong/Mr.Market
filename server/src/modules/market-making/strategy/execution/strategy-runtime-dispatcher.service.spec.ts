import { BadRequestException } from '@nestjs/common';

import { StrategyService } from '../strategy.service';
import { StrategyRuntimeDispatcherService } from './strategy-runtime-dispatcher.service';

describe('StrategyRuntimeDispatcherService', () => {
  let service: StrategyRuntimeDispatcherService;
  const strategyService = {
    startArbitrageStrategyForUser: jest.fn(),
    executePureMarketMakingStrategy: jest.fn(),
    executeVolumeStrategy: jest.fn(),
    stopStrategyForUser: jest.fn(),
  } as unknown as StrategyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StrategyRuntimeDispatcherService(strategyService);
  });

  it('maps controller type to strategy type', () => {
    expect(service.toStrategyType('arbitrage')).toBe('arbitrage');
    expect(service.toStrategyType('pureMarketMaking')).toBe('pureMarketMaking');
    expect(service.toStrategyType('pure_market_making')).toBe(
      'pureMarketMaking',
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
