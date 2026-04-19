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

  it('fully overwrites account balances when a new snapshot arrives', () => {
    const service = new BalanceStateCacheService();

    service.applyBalanceSnapshot(
      'binance',
      'maker',
      {
        free: { BTC: 1, USDT: 100 },
      },
      '2026-04-18T00:00:00.000Z',
      'ws',
    );
    service.applyBalanceSnapshot(
      'binance',
      'maker',
      {
        free: { USDT: 250 },
      },
      '2026-04-18T00:00:05.000Z',
      'ws',
    );

    expect(service.getBalance('binance', 'maker', 'BTC')).toBeUndefined();
    expect(service.getBalance('binance', 'maker', 'USDT')).toEqual(
      expect.objectContaining({ free: '250' }),
    );
  });

  it('tracks account snapshot freshness and diagnostics', () => {
    const service = new BalanceStateCacheService();

    service.applyBalanceSnapshot(
      'binance',
      'maker',
      { free: { USDT: 100 } },
      '2026-04-18T00:00:00.000Z',
      'rest',
    );

    expect(
      service.hasFreshAccountSnapshot(
        'binance',
        'maker',
        Date.parse('2026-04-18T00:00:10.000Z'),
      ),
    ).toBe(true);
    expect(service.getSnapshotTimestamp('binance', 'maker')).toBe(
      '2026-04-18T00:00:00.000Z',
    );
    expect(
      service.getSnapshotDiagnostic(
        'binance',
        'maker',
        Date.parse('2026-04-18T00:00:20.000Z'),
      ),
    ).toEqual({
      present: true,
      fresh: true,
      ageMs: 20000,
      freshnessTimestamp: '2026-04-18T00:00:00.000Z',
      source: 'rest',
    });
    expect(
      service.hasFreshAccountSnapshot(
        'binance',
        'maker',
        Date.parse('2026-04-18T00:00:20.000Z'),
      ),
    ).toBe(true);
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

    expect(service.isFresh(entry, Date.parse('2026-04-18T00:01:20.000Z'))).toBe(
      false,
    );
    expect(service.isFresh(entry, Date.parse('2026-04-18T00:01:25.000Z'))).toBe(
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
        Date.parse('2026-04-18T00:01:50.000Z'),
      ),
    ).toBe(false);
    expect(emitBalanceStaleSpy).toHaveBeenCalledTimes(2);
  });
});
