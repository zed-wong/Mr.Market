/* eslint-disable @typescript-eslint/no-explicit-any */
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ArbitrageStrategyController } from './arbitrage-strategy.controller';
import { DualAccountBestCapacityVolumeStrategyController } from './dual-account-best-capacity-volume-strategy.controller';
import { DualAccountVolumeStrategyController } from './dual-account-volume-strategy.controller';
import { PureMarketMakingStrategyController } from './pure-market-making-strategy.controller';
import { StrategyControllerRegistry } from './strategy-controller.registry';
import { TimeIndicatorStrategyController } from './time-indicator-strategy.controller';
import { VolumeStrategyController } from './volume-strategy.controller';

describe('StrategyControllerRegistry', () => {
  const service = {
    buildPureMarketMakingActions: jest
      .fn()
      .mockResolvedValue([{ type: 'CREATE_LIMIT_ORDER' }]),
    executePureMarketMakingStrategy: jest.fn().mockResolvedValue(undefined),
    buildDualAccountVolumeSessionActions: jest
      .fn()
      .mockResolvedValue([{ type: 'CREATE_LIMIT_ORDER' }]),
    buildDualAccountBestCapacityVolumeSessionActions: jest
      .fn()
      .mockResolvedValue([{ type: 'CREATE_LIMIT_ORDER' }]),
    onDualAccountVolumeActionsPublished: jest.fn().mockResolvedValue(undefined),
    executeDualAccountVolumeStrategy: jest.fn().mockResolvedValue(undefined),
    executeDualAccountBestCapacityVolumeStrategy: jest
      .fn()
      .mockResolvedValue(undefined),
    buildArbitrageActions: jest
      .fn()
      .mockResolvedValue([{ type: 'CREATE_LIMIT_ORDER' }]),
    startArbitrageStrategyForUser: jest.fn().mockResolvedValue(undefined),
    buildVolumeSessionActions: jest
      .fn()
      .mockResolvedValue([{ type: 'CREATE_LIMIT_ORDER' }]),
    onVolumeActionsPublished: jest.fn().mockResolvedValue(undefined),
    executeVolumeStrategy: jest.fn().mockResolvedValue(undefined),
    buildTimeIndicatorActions: jest
      .fn()
      .mockResolvedValue([{ type: 'CREATE_LIMIT_ORDER' }]),
    executeTimeIndicatorStrategy: jest.fn().mockResolvedValue(undefined),
  };

  const session = {
    runId: 'run-1',
    strategyKey: 'strategy-1',
    strategyType: 'pureMarketMaking',
    userId: 'user-1',
    clientId: 'client-1',
    cadenceMs: 1000,
    nextRunAtMs: 0,
    params: {
      userId: 'user-1',
      clientId: 'client-1',
      orderRefreshTime: 500,
      checkIntervalSeconds: 3,
      baseIntervalTime: 7,
      tickIntervalMs: 1500,
      exchangeName: 'binance',
      symbol: 'BTC/USDT',
      baseIncrementPercentage: 0.1,
      baseTradeAmount: 1,
      numTrades: 2,
      pricePushRate: 0,
      postOnlySide: 'buy',
      executionVenue: 'dex',
      dexId: 'uniswapV3',
      chainId: 1,
      tokenIn: '0x0000000000000000000000000000000000000001',
      tokenOut: '0x0000000000000000000000000000000000000002',
      feeTier: 3000,
      slippageBps: 100,
      recipient: '0x0000000000000000000000000000000000000003',
      executionCategory: 'amm_dex',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers controllers by type and lists them in insertion order', () => {
    const pure = new PureMarketMakingStrategyController();
    const arbitrage = new ArbitrageStrategyController();
    const dualAccountBestCapacityVolume =
      new DualAccountBestCapacityVolumeStrategyController();
    const dualAccountVolume = new DualAccountVolumeStrategyController();
    const volume = new VolumeStrategyController();
    const registry = new StrategyControllerRegistry([
      pure,
      arbitrage,
      dualAccountBestCapacityVolume,
      dualAccountVolume,
      volume,
    ]);

    expect(registry.getController('pureMarketMaking')).toBe(pure);
    expect(registry.getController('arbitrage')).toBe(arbitrage);
    expect(registry.getController('dualAccountBestCapacityVolume')).toBe(
      dualAccountBestCapacityVolume,
    );
    expect(registry.getController('dualAccountVolume')).toBe(dualAccountVolume);
    expect(registry.getController('volume')).toBe(volume);
    expect(registry.getController('missing')).toBeUndefined();
    expect(registry.listControllerTypes()).toEqual([
      'pureMarketMaking',
      'arbitrage',
      'dualAccountBestCapacityVolume',
      'dualAccountVolume',
      'volume',
    ]);
  });

  it('rejects duplicate controller registrations', () => {
    expect(
      () =>
        new StrategyControllerRegistry([
          new PureMarketMakingStrategyController(),
          new PureMarketMakingStrategyController(),
        ]),
    ).toThrow(
      'Duplicate strategy controller registered for type "pureMarketMaking"',
    );
  });

  it('delegates pure market making controller operations to StrategyService', async () => {
    const controller = new PureMarketMakingStrategyController();
    const strategyInstance = {
      parameters: session.params,
    } as unknown as StrategyInstance;

    expect(controller.getCadenceMs({ orderRefreshTime: 200 })).toBe(1000);
    expect(controller.getCadenceMs({ orderRefreshTime: 2500 })).toBe(2500);
    expect(controller.getCadenceMs({})).toBe(1000);

    await expect(
      controller.decideActions(
        session as any,
        '2026-03-11T00:00:00.000Z',
        service as any,
      ),
    ).resolves.toEqual([{ type: 'CREATE_LIMIT_ORDER' }]);
    await expect(
      controller.rerun(strategyInstance, service as any),
    ).resolves.toBeUndefined();

    expect(service.buildPureMarketMakingActions).toHaveBeenCalledWith(
      'strategy-1',
      session.params,
      '2026-03-11T00:00:00.000Z',
    );
    expect(service.executePureMarketMakingStrategy).toHaveBeenCalledWith(
      session.params,
    );
  });

  it('delegates arbitrage controller operations to StrategyService', async () => {
    const controller = new ArbitrageStrategyController();
    const strategyInstance = {
      parameters: {
        ...session.params,
        checkIntervalSeconds: 5,
        maxOpenOrders: 4,
      },
    } as unknown as StrategyInstance;

    expect(controller.getCadenceMs({ checkIntervalSeconds: 0.2 })).toBe(1000);
    expect(controller.getCadenceMs({ checkIntervalSeconds: 5 })).toBe(5000);

    await expect(
      controller.decideActions(
        { ...session, strategyType: 'arbitrage' } as any,
        '2026-03-11T00:00:00.000Z',
        service as any,
      ),
    ).resolves.toEqual([{ type: 'CREATE_LIMIT_ORDER' }]);
    await expect(
      controller.rerun(strategyInstance, service as any),
    ).resolves.toBeUndefined();

    expect(service.buildArbitrageActions).toHaveBeenCalledWith(
      'strategy-1',
      session.params,
      '2026-03-11T00:00:00.000Z',
    );
    expect(service.startArbitrageStrategyForUser).toHaveBeenCalledWith(
      strategyInstance.parameters,
      5,
      4,
    );
  });

  it('delegates dual-account volume controller operations to StrategyService', async () => {
    const controller = new DualAccountVolumeStrategyController();
    const strategyInstance = {
      userId: 'entity-user',
      clientId: 'entity-client',
      parameters: {
        ...session.params,
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        tradeAmountVariance: 0.1,
        priceOffsetVariance: 0.2,
        cadenceVariance: 0.3,
        buyBias: 0.6,
        accountProfiles: {
          maker: {
            tradeAmountMultiplier: 0.95,
          },
        },
        userId: 'stale-user',
        clientId: 'stale-client',
      },
    } as unknown as StrategyInstance;
    const actions = [{ type: 'CREATE_LIMIT_ORDER' }] as any[];

    expect(controller.getCadenceMs({ baseIntervalTime: 0.5 })).toBe(1000);
    expect(controller.getCadenceMs({ baseIntervalTime: 8 })).toBe(8000);
    expect(controller.getCadenceMs({ baseIntervalTime: 'oops' as any })).toBe(
      10000,
    );

    await expect(
      controller.decideActions(
        { ...session, strategyType: 'dualAccountVolume' } as any,
        '2026-03-11T00:00:00.000Z',
        service as any,
      ),
    ).resolves.toEqual(actions);
    await expect(
      controller.onActionsPublished?.(
        { ...session, strategyType: 'dualAccountVolume' } as any,
        actions,
        service as any,
      ),
    ).resolves.toBeUndefined();
    await expect(
      controller.rerun(strategyInstance, service as any),
    ).resolves.toBeUndefined();

    expect(service.buildDualAccountVolumeSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyType: 'dualAccountVolume',
      }),
      '2026-03-11T00:00:00.000Z',
    );
    expect(service.onDualAccountVolumeActionsPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyType: 'dualAccountVolume',
      }),
      actions,
    );
    expect(service.executeDualAccountVolumeStrategy).toHaveBeenCalledWith(
      expect.objectContaining({
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        tradeAmountVariance: 0.1,
        priceOffsetVariance: 0.2,
        cadenceVariance: 0.3,
        buyBias: 0.6,
        accountProfiles: {
          maker: {
            tradeAmountMultiplier: 0.95,
          },
        },
        userId: 'entity-user',
        clientId: 'entity-client',
      }),
    );
  });

  it('delegates volume controller operations to StrategyService', async () => {
    const controller = new VolumeStrategyController();
    const strategyInstance = {
      userId: 'entity-user',
      clientId: 'entity-client',
      parameters: {
        ...session.params,
        userId: 'stale-user',
        clientId: 'stale-client',
        incrementPercentage: 0.25,
        intervalTime: 11,
        tradeAmount: 3,
        baseIncrementPercentage: undefined,
        baseIntervalTime: undefined,
        baseTradeAmount: undefined,
      },
    } as unknown as StrategyInstance;
    const actions = [{ type: 'CREATE_LIMIT_ORDER' }] as any[];

    expect(controller.getCadenceMs({ baseIntervalTime: 0.5 })).toBe(1000);
    expect(controller.getCadenceMs({ baseIntervalTime: 8 })).toBe(8000);
    expect(controller.getCadenceMs({ intervalTime: 'oops' as any })).toBe(
      10000,
    );

    await expect(
      controller.decideActions(
        { ...session, strategyType: 'volume' } as any,
        '2026-03-11T00:00:00.000Z',
        service as any,
      ),
    ).resolves.toEqual(actions);
    await expect(
      controller.onActionsPublished?.(
        { ...session, strategyType: 'volume' } as any,
        actions,
        service as any,
      ),
    ).resolves.toBeUndefined();
    await expect(
      controller.rerun(strategyInstance, service as any),
    ).resolves.toBeUndefined();

    expect(service.buildVolumeSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyType: 'volume',
      }),
      '2026-03-11T00:00:00.000Z',
    );
    expect(service.onVolumeActionsPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyType: 'volume',
      }),
      actions,
    );
    expect(service.executeVolumeStrategy).toHaveBeenCalledWith(
      session.params.exchangeName,
      session.params.symbol,
      0.25,
      11,
      3,
      session.params.numTrades,
      'entity-user',
      'entity-client',
      session.params.pricePushRate,
      session.params.postOnlySide,
      session.params.executionVenue,
      session.params.dexId,
      session.params.chainId,
      session.params.tokenIn,
      session.params.tokenOut,
      session.params.feeTier,
      session.params.slippageBps,
      session.params.recipient,
      session.params.executionCategory,
    );
  });

  it('delegates time indicator controller operations to StrategyService', async () => {
    const controller = new TimeIndicatorStrategyController();
    const strategyInstance = {
      parameters: {
        ...session.params,
        tickIntervalMs: 4000,
      },
    } as unknown as StrategyInstance;

    expect(controller.getCadenceMs({ tickIntervalMs: 500 })).toBe(1000);
    expect(controller.getCadenceMs({ tickIntervalMs: 4000 })).toBe(4000);

    await expect(
      controller.decideActions(
        { ...session, strategyType: 'timeIndicator' } as any,
        '2026-03-11T00:00:00.000Z',
        service as any,
      ),
    ).resolves.toEqual([{ type: 'CREATE_LIMIT_ORDER' }]);
    await expect(
      controller.rerun(strategyInstance, service as any),
    ).resolves.toBeUndefined();

    expect(service.buildTimeIndicatorActions).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyType: 'timeIndicator',
      }),
      '2026-03-11T00:00:00.000Z',
    );
    expect(service.executeTimeIndicatorStrategy).toHaveBeenCalledWith(
      strategyInstance.parameters,
    );
  });
});
