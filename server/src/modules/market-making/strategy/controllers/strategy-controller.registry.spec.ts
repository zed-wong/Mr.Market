/* eslint-disable @typescript-eslint/no-explicit-any */
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ArbitrageStrategyController } from './arbitrage-strategy.controller';
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
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers controllers by type and lists them in insertion order', () => {
    const pure = new PureMarketMakingStrategyController();
    const arbitrage = new ArbitrageStrategyController();
    const volume = new VolumeStrategyController();
    const registry = new StrategyControllerRegistry([
      pure,
      arbitrage,
      volume,
    ]);

    expect(registry.getController('pureMarketMaking')).toBe(pure);
    expect(registry.getController('arbitrage')).toBe(arbitrage);
    expect(registry.getController('volume')).toBe(volume);
    expect(registry.getController('missing')).toBeUndefined();
    expect(registry.listControllerTypes()).toEqual([
      'pureMarketMaking',
      'arbitrage',
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

    await expect(
      controller.decideActions(session as any, '2026-03-11T00:00:00.000Z', service as any),
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

  it('delegates volume controller operations to StrategyService', async () => {
    const controller = new VolumeStrategyController();
    const strategyInstance = {
      parameters: session.params,
    } as unknown as StrategyInstance;
    const actions = [{ type: 'CREATE_LIMIT_ORDER' }] as any[];

    expect(controller.getCadenceMs({ baseIntervalTime: 0.5 })).toBe(1000);
    expect(controller.getCadenceMs({ baseIntervalTime: 8 })).toBe(8000);

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
      session.params.baseIncrementPercentage,
      session.params.baseIntervalTime,
      session.params.baseTradeAmount,
      session.params.numTrades,
      session.params.userId,
      session.params.clientId,
      session.params.pricePushRate,
      session.params.postOnlySide,
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
