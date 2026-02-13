import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';

import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { TickComponent } from '../tick/tick-component.interface';

type TrackedOrder = {
  strategyKey: string;
  exchange: string;
  pair: string;
  exchangeOrderId: string;
  side: 'buy' | 'sell';
  price: string;
  qty: string;
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'failed';
  updatedAt: string;
};

@Injectable()
export class ExchangeOrderTrackerService
  implements TickComponent, OnModuleInit, OnModuleDestroy
{
  private readonly orders = new Map<string, TrackedOrder>();

  constructor(
    @Optional()
    private readonly clockTickCoordinatorService?: ClockTickCoordinatorService,
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.clockTickCoordinatorService?.register(
      'exchange-order-tracker',
      this,
      3,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.clockTickCoordinatorService?.unregister('exchange-order-tracker');
  }

  async start(): Promise<void> {
    return;
  }

  async stop(): Promise<void> {
    return;
  }

  async health(): Promise<boolean> {
    return true;
  }

  upsertOrder(order: TrackedOrder): void {
    this.orders.set(order.exchangeOrderId, order);
  }

  getOpenOrders(strategyKey: string): TrackedOrder[] {
    return [...this.orders.values()].filter(
      (order) => order.strategyKey === strategyKey && order.status === 'open',
    );
  }

  getByExchangeOrderId(exchangeOrderId: string): TrackedOrder | undefined {
    return this.orders.get(exchangeOrderId);
  }

  async onTick(_: string): Promise<void> {
    const openOrders = [...this.orders.values()].filter(
      (order) => order.status === 'open' || order.status === 'partially_filled',
    );

    for (const order of openOrders) {
      const latest = await this.exchangeConnectorAdapterService?.fetchOrder(
        order.exchange,
        order.pair,
        order.exchangeOrderId,
      );

      if (!latest) {
        continue;
      }

      const normalizedStatus = this.normalizeStatus(latest.status);

      this.orders.set(order.exchangeOrderId, {
        ...order,
        status: normalizedStatus,
        updatedAt: getRFC3339Timestamp(),
      });
    }
  }

  private normalizeStatus(status: string): TrackedOrder['status'] {
    const value = (status || '').toLowerCase();

    if (value === 'open' || value === 'new') {
      return 'open';
    }
    if (value === 'partially_filled' || value === 'partially-filled') {
      return 'partially_filled';
    }
    if (value === 'closed' || value === 'filled') {
      return 'filled';
    }
    if (value === 'canceled' || value === 'cancelled') {
      return 'cancelled';
    }

    return 'failed';
  }
}
