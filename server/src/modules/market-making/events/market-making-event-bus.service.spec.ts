import { MarketMakingEventBus } from './market-making-event-bus.service';
import { MARKET_MAKING_EVENT_NAMES } from './market-making-events.types';

describe('MarketMakingEventBus', () => {
  it('delivers typed events to direct subscribers and supports detach', () => {
    const bus = new MarketMakingEventBus();
    const listener = jest.fn();

    const detach = bus.on(MARKET_MAKING_EVENT_NAMES.balanceStale, listener);

    bus.emitBalanceStale({
      exchange: 'binance',
      accountLabel: 'maker',
      staleAt: '2026-04-18T00:01:00.000Z',
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: 'binance',
        staleAt: '2026-04-18T00:01:00.000Z',
      }),
    );

    detach();
    listener.mockClear();

    bus.emitBalanceStale({
      exchange: 'binance',
      accountLabel: 'maker',
      staleAt: '2026-04-18T00:02:00.000Z',
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('supports exchange-scoped listeners while keeping flat event names', () => {
    const bus = new MarketMakingEventBus();
    const listener = jest.fn();

    const detach = bus.onExchangeEvent(
      'binance',
      MARKET_MAKING_EVENT_NAMES.streamHealthChanged,
      listener,
    );

    bus.emitStreamHealthChanged({
      exchange: 'mexc',
      accountLabel: 'maker',
      previousHealth: 'healthy',
      health: 'degraded',
      changedAt: '2026-04-18T00:00:00.000Z',
    });
    bus.emitStreamHealthChanged({
      exchange: 'binance',
      accountLabel: 'maker',
      previousHealth: 'healthy',
      health: 'silent',
      changedAt: '2026-04-18T00:00:01.000Z',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        health: 'silent',
      }),
    );

    detach();
  });

  it('emits reconciliation audit events', () => {
    const bus = new MarketMakingEventBus();
    const listener = jest.fn();

    bus.on(MARKET_MAKING_EVENT_NAMES.reconciliationAudit, listener);

    bus.emitReconciliationAudit({
      correctionType: 'estimated_fee_reversal',
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '0.1',
      refType: 'market_making_estimated_fee_reversal',
      refId: 'trade-1',
      reversalOf: 'estimated-fee-1',
      observedAt: '2026-05-04T00:00:00.000Z',
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        correctionType: 'estimated_fee_reversal',
        refType: 'market_making_estimated_fee_reversal',
        refId: 'trade-1',
      }),
    );
  });
});
