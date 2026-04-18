/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExchangeConnectorRegistry } from './exchange-connector-registry';

describe('ExchangeConnectorRegistry', () => {
  it('returns one connector runtime per exchange with the expected component wiring', () => {
    const dependencies = {
      orderTracker: { id: 'orderTracker' },
      reconciliationRunner: { id: 'reconciliationRunner' },
      userStreamTracker: { id: 'userStreamTracker' },
      balanceCache: { id: 'balanceCache' },
      balanceRefreshScheduler: { id: 'balanceRefreshScheduler' },
      orderBookTracker: { id: 'orderBookTracker' },
    };
    const registry = new ExchangeConnectorRegistry(
      dependencies.orderTracker as any,
      dependencies.reconciliationRunner as any,
      dependencies.userStreamTracker as any,
      dependencies.balanceCache as any,
      dependencies.balanceRefreshScheduler as any,
      dependencies.orderBookTracker as any,
    );

    const binanceRuntime = registry.get('Binance');
    const mexcRuntime = registry.get('mexc');

    expect(binanceRuntime).toEqual({
      exchange: 'binance',
      orderTracker: dependencies.orderTracker,
      reconciliationRunner: dependencies.reconciliationRunner,
      userStreamTracker: dependencies.userStreamTracker,
      balanceCache: dependencies.balanceCache,
      balanceRefreshScheduler: dependencies.balanceRefreshScheduler,
      orderBookTracker: dependencies.orderBookTracker,
    });
    expect(registry.get('binance')).toBe(binanceRuntime);
    expect(mexcRuntime.exchange).toBe('mexc');
    expect(mexcRuntime.orderTracker).toBe(dependencies.orderTracker);
  });
});
