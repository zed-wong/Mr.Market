import { ExecutorRegistry } from './executor-registry';

describe('ExecutorRegistry', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates executors on demand and reuses them by normalized exchange-pair key', async () => {
    const registry = new ExecutorRegistry();
    const onFill = jest.fn();

    const first = registry.getOrCreateExecutor('Binance', 'btc/usdt');
    const second = registry.getOrCreateExecutor('binance', 'BTC/USDT', {
      onFill,
    });

    expect(second).toBe(first);

    await second.addOrder('order-1', 'user-1', {
      strategyKey: 'strategy-1',
      strategyType: 'pureMarketMaking',
      clientId: 'client-1',
      cadenceMs: 1000,
      params: {},
    });
    await second.onFill({
      orderId: 'order-1',
      clientOrderId: 'order-1:0',
    });

    expect(onFill).toHaveBeenCalledTimes(1);
  });

  it('removes only empty executors', async () => {
    const registry = new ExecutorRegistry();
    const executor = registry.getOrCreateExecutor('binance', 'BTC/USDT');

    await executor.addOrder('order-1', 'user-1', {
      strategyKey: 'strategy-1',
      strategyType: 'pureMarketMaking',
      clientId: 'client-1',
      cadenceMs: 1000,
      params: {},
    });

    registry.removeExecutorIfEmpty('binance', 'BTC/USDT');
    expect(registry.getExecutor('binance', 'BTC/USDT')).toBe(executor);

    await executor.removeOrder('order-1');
    registry.removeExecutorIfEmpty('binance', 'BTC/USDT');

    expect(registry.getExecutor('binance', 'BTC/USDT')).toBeUndefined();
  });

  it('lists active executors in stable key order', () => {
    const registry = new ExecutorRegistry();

    registry.getOrCreateExecutor('okx', 'ETH/USDT');
    registry.getOrCreateExecutor('binance', 'BTC/USDT');

    expect(
      registry.getActiveExecutors().map((executor) => ({
        exchange: executor.exchange,
        pair: executor.pair,
      })),
    ).toEqual([
      { exchange: 'binance', pair: 'BTC/USDT' },
      { exchange: 'okx', pair: 'ETH/USDT' },
    ]);
  });

  it('finds executor by attached order id', async () => {
    const registry = new ExecutorRegistry();
    const executor = registry.getOrCreateExecutor('binance', 'BTC/USDT');

    await executor.addOrder('order-42', 'user-1', {
      strategyKey: 'strategy-42',
      strategyType: 'pureMarketMaking',
      clientId: 'client-42',
      cadenceMs: 1000,
      params: {},
    });

    expect(registry.findExecutorByOrderId('order-42')).toBe(executor);
    expect(registry.findExecutorByOrderId('missing')).toBeUndefined();
  });
});
