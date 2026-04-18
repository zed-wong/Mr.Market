import { EventEmitter2 } from '@nestjs/event-emitter';

import { MarketMakingEventBus } from './market-making-event-bus.service';
import { MARKET_MAKING_EVENT_NAMES } from './market-making-events.types';

describe('MarketMakingEventBus', () => {
  it('delivers typed events to direct subscribers', () => {
    const bus = new MarketMakingEventBus();
    const listener = jest.fn();

    const detach = bus.on(
      MARKET_MAKING_EVENT_NAMES.orderStateChanged,
      listener,
    );

    bus.emitOrderStateChanged({
      exchange: 'binance',
      accountLabel: 'maker',
      strategyKey: 'strategy-1',
      orderId: 'order-1',
      exchangeOrderId: 'ex-1',
      previousState: 'open',
      newState: 'filled',
      source: 'ws',
      updatedAt: '2026-04-18T00:00:00.000Z',
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: 'binance',
        newState: 'filled',
      }),
    );

    detach();
    bus.emitOrderStateChanged({
      exchange: 'binance',
      accountLabel: 'maker',
      strategyKey: 'strategy-1',
      orderId: 'order-1',
      exchangeOrderId: 'ex-1',
      previousState: 'filled',
      newState: 'cancelled',
      source: 'system',
      updatedAt: '2026-04-18T00:00:01.000Z',
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports namespace subscriptions through the underlying emitter', () => {
    const eventEmitter = new EventEmitter2({
      wildcard: true,
      delimiter: '.',
    });
    const bus = new MarketMakingEventBus(eventEmitter);
    const wildcardListener = jest.fn();

    eventEmitter.on('order.*', wildcardListener);

    bus.emitOrderFillRecovered({
      exchange: 'binance',
      accountLabel: 'maker',
      strategyKey: 'strategy-1',
      orderId: 'order-1',
      exchangeOrderId: 'ex-1',
      fillDelta: {
        qty: '0.5',
        cumulativeQty: '0.5',
      },
      source: 'rest',
      recoveredAt: '2026-04-18T00:00:00.000Z',
    });

    expect(wildcardListener).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'ex-1',
      }),
    );
  });

  it('supports exchange-scoped listeners while keeping flat event names', () => {
    const bus = new MarketMakingEventBus();
    const listener = jest.fn();

    const detach = bus.onExchangeEvent(
      'binance',
      MARKET_MAKING_EVENT_NAMES.orderStateChanged,
      listener,
    );

    bus.emitOrderStateChanged({
      exchange: 'mexc',
      accountLabel: 'maker',
      strategyKey: 'strategy-1',
      orderId: 'order-1',
      exchangeOrderId: 'ex-1',
      newState: 'open',
      source: 'ws',
      updatedAt: '2026-04-18T00:00:00.000Z',
    });
    bus.emitOrderStateChanged({
      exchange: 'binance',
      accountLabel: 'maker',
      strategyKey: 'strategy-1',
      orderId: 'order-1',
      exchangeOrderId: 'ex-2',
      newState: 'filled',
      source: 'rest',
      updatedAt: '2026-04-18T00:00:01.000Z',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'ex-2',
      }),
    );

    detach();
  });
});
