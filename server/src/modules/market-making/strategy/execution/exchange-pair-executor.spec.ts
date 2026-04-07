import {
  ExchangePairExecutor,
  ExchangePairExecutorOrderConfig,
} from './exchange-pair-executor';

describe('ExchangePairExecutor', () => {
  const baseConfig: ExchangePairExecutorOrderConfig = {
    strategyKey: 'strategy-1',
    strategyType: 'pureMarketMaking',
    clientId: 'client-1',
    cadenceMs: 1000,
    params: { foo: 'bar' },
  };

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds and removes order sessions', async () => {
    const executor = new ExchangePairExecutor('binance', 'BTC/USDT');

    const session = await executor.addOrder('order-1', 'user-1', baseConfig);

    expect(session.orderId).toBe('order-1');
    expect(session.exchange).toBe('binance');
    expect(session.pair).toBe('BTC/USDT');
    expect(session.marketMakingOrderId).toBe('order-1');
    expect(session.nextRunAtMs).toBe(1000);
    expect(executor.getSession('order-1')).toEqual(session);
    expect(executor.isEmpty()).toBe(false);

    await executor.removeOrder('order-1');

    expect(executor.getSession('order-1')).toBeUndefined();
    expect(executor.isEmpty()).toBe(true);
  });

  it('runs due sessions and advances nextRunAtMs', async () => {
    const onTick = jest.fn();
    const executor = new ExchangePairExecutor('binance', 'BTC/USDT', {
      onTick,
    });

    await executor.addOrder('order-1', 'user-1', {
      ...baseConfig,
      strategyKey: 'a',
      nextRunAtMs: 1000,
    });
    await executor.addOrder('order-2', 'user-2', {
      ...baseConfig,
      strategyKey: 'b',
      nextRunAtMs: 2500,
    });

    await executor.onTick('2026-03-11T10:00:00Z');

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        strategyKey: 'a',
      }),
      '2026-03-11T10:00:00Z',
    );
    expect(executor.getSession('order-1')?.nextRunAtMs).toBe(2000);
    expect(executor.getSession('order-2')?.nextRunAtMs).toBe(2500);
  });

  it('does not advance a session that was replaced during onTick', async () => {
    const executor = new ExchangePairExecutor('binance', 'BTC/USDT', {
      onTick: async (session) => {
        await executor.addOrder(session.orderId, session.userId, {
          ...baseConfig,
          strategyKey: session.strategyKey,
          nextRunAtMs: 5000,
          runId: 'replacement-run',
        });
      },
    });

    await executor.addOrder('order-1', 'user-1', {
      ...baseConfig,
      nextRunAtMs: 1000,
      runId: 'initial-run',
    });

    await executor.onTick('2026-03-11T10:00:00Z');

    expect(executor.getSession('order-1')?.runId).toBe('replacement-run');
    expect(executor.getSession('order-1')?.nextRunAtMs).toBe(5000);
  });

  it('routes targeted fills to the matching order only', async () => {
    const onFill = jest.fn();
    const executor = new ExchangePairExecutor('binance', 'BTC/USDT', {
      onFill,
    });

    await executor.addOrder('order-1', 'user-1', {
      ...baseConfig,
      strategyKey: 'a',
    });
    await executor.addOrder('order-2', 'user-2', {
      ...baseConfig,
      strategyKey: 'b',
    });

    await executor.onFill({
      orderId: 'order-2',
      clientOrderId: 'order-2:0',
      exchangeOrderId: 'ex-2',
    });

    expect(onFill).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-2',
      }),
      expect.objectContaining({
        clientOrderId: 'order-2:0',
      }),
    );
  });

  it('broadcasts untargeted fills to all active sessions in strategy order', async () => {
    const calls: string[] = [];
    const executor = new ExchangePairExecutor('binance', 'BTC/USDT', {
      onFill: async (session) => {
        calls.push(session.strategyKey);
      },
    });

    await executor.addOrder('order-2', 'user-2', {
      ...baseConfig,
      strategyKey: 'b',
    });
    await executor.addOrder('order-1', 'user-1', {
      ...baseConfig,
      strategyKey: 'a',
    });

    await executor.onFill({
      clientOrderId: 'unknown',
      exchangeOrderId: 'ex-1',
    });

    expect(calls).toEqual(['a', 'b']);
  });

});
