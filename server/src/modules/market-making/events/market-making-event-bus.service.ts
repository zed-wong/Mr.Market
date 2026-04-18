import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type {
  MarketMakingBalanceStaleEvent,
  MarketMakingBalanceUpdatedEvent,
  MarketMakingEventName,
  MarketMakingEventPayloadMap,
  MarketMakingOrderFillRecoveredEvent,
  MarketMakingOrderStateChangedEvent,
  MarketMakingStreamHealthChangedEvent,
} from './market-making-events.types';
import { MARKET_MAKING_EVENT_NAMES } from './market-making-events.types';

type MarketMakingEventListener<TEventName extends MarketMakingEventName> = (
  payload: MarketMakingEventPayloadMap[TEventName],
) => void;

@Injectable()
export class MarketMakingEventBus {
  private readonly eventEmitter: EventEmitter2;

  constructor(@Optional() eventEmitter?: EventEmitter2) {
    this.eventEmitter =
      eventEmitter ||
      new EventEmitter2({
        wildcard: true,
        delimiter: '.',
      });
  }

  emitOrderStateChanged(payload: MarketMakingOrderStateChangedEvent): void {
    this.emit(MARKET_MAKING_EVENT_NAMES.orderStateChanged, payload);
  }

  emitOrderFillRecovered(payload: MarketMakingOrderFillRecoveredEvent): void {
    this.emit(MARKET_MAKING_EVENT_NAMES.orderFillRecovered, payload);
  }

  emitBalanceUpdated(payload: MarketMakingBalanceUpdatedEvent): void {
    this.emit(MARKET_MAKING_EVENT_NAMES.balanceUpdated, payload);
  }

  emitBalanceStale(payload: MarketMakingBalanceStaleEvent): void {
    this.emit(MARKET_MAKING_EVENT_NAMES.balanceStale, payload);
  }

  emitStreamHealthChanged(payload: MarketMakingStreamHealthChangedEvent): void {
    this.emit(MARKET_MAKING_EVENT_NAMES.streamHealthChanged, payload);
  }

  on<TEventName extends MarketMakingEventName>(
    eventName: TEventName,
    listener: MarketMakingEventListener<TEventName>,
  ): () => void {
    this.eventEmitter.on(
      eventName,
      listener as unknown as (...args: unknown[]) => void,
    );

    return () => {
      this.eventEmitter.off(
        eventName,
        listener as unknown as (...args: unknown[]) => void,
      );
    };
  }

  private emit<TEventName extends MarketMakingEventName>(
    eventName: TEventName,
    payload: MarketMakingEventPayloadMap[TEventName],
  ): void {
    this.eventEmitter.emit(eventName, payload);
  }
}
