import { MarketMakingEventBus } from '../events/market-making-event-bus.service';
import { BalanceStateCacheService } from './balance-state-cache.service';

describe('BalanceStateCacheService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits balance.updated when a snapshot is applied', () => {
    const marketMakingEventBus = new MarketMakingEventBus();
    const emitBalanceUpdatedSpy = jest.spyOn(
      marketMakingEventBus,
      'emitBalanceUpdated',
    );
    const service = new BalanceStateCacheService(marketMakingEventBus);

    service.applyBalanceSnapshot(
      'binance',
      'maker',
      {
        free: { BTC: 1.5, USDT: 200 },
      },
      '2026-04-18T00:00:00.000Z',
      'ws',
    );

    expect(emitBalanceUpdatedSpy).toHaveBeenCalledWith({
      exchange: 'binance',
      accountLabel: 'maker',
      source: 'ws',
      balances: [
        expect.objectContaining({
          asset: 'BTC',
          free: '1.5',
        }),
        expect.objectContaining({
          asset: 'USDT',
          free: '200',
        }),
      ],
      updatedAt: '2026-04-18T00:00:00.000Z',
    });
  });

  it('emits balance.stale only once per account until a fresh update arrives', () => {
    const marketMakingEventBus = new MarketMakingEventBus();
    const emitBalanceStaleSpy = jest.spyOn(
      marketMakingEventBus,
      'emitBalanceStale',
    );
    const service = new BalanceStateCacheService(marketMakingEventBus);

    service.applyBalanceUpdate({
      exchange: 'binance',
      accountLabel: 'maker',
      asset: 'USDT',
      free: '100',
      source: 'ws',
      freshnessTimestamp: '2026-04-18T00:00:00.000Z',
    });

    const entry = service.getBalance('binance', 'maker', 'USDT');

    expect(service.isFresh(entry, Date.parse('2026-04-18T00:00:20.000Z'))).toBe(
      false,
    );
    expect(service.isFresh(entry, Date.parse('2026-04-18T00:00:25.000Z'))).toBe(
      false,
    );
    expect(emitBalanceStaleSpy).toHaveBeenCalledTimes(1);

    service.applyBalanceUpdate({
      exchange: 'binance',
      accountLabel: 'maker',
      asset: 'USDT',
      free: '120',
      source: 'rest',
      freshnessTimestamp: '2026-04-18T00:00:30.000Z',
    });

    expect(
      service.isFresh(
        service.getBalance('binance', 'maker', 'USDT'),
        Date.parse('2026-04-18T00:00:50.000Z'),
      ),
    ).toBe(false);
    expect(emitBalanceStaleSpy).toHaveBeenCalledTimes(2);
  });
});
