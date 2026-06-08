/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Optional } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { ExchangeOrderMappingService } from '../execution/exchange-order-mapping.service';
import { MarketMakingRuntimeTimingService } from '../tick/runtime-timing.service';
import {
  ExchangeOrderTrackerService,
  TrackedOrder,
} from './exchange-order-tracker.service';

@Injectable()
export class TrackedOrderShutdownService {
  private readonly logger = new CustomLogger(TrackedOrderShutdownService.name);
  private readonly mmLog = this.logger.marketMaking();

  constructor(
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
    @Optional()
    private readonly exchangeOrderMappingService?: ExchangeOrderMappingService,
    @Optional()
    private readonly runtimeTimingService?: MarketMakingRuntimeTimingService,
  ) {}

  async cancelTrackedOrdersForStrategy(
    strategyKey: string,
    timeoutMs = 10_000,
  ): Promise<void> {
    const openOrders = this.getCancelableTrackedOrders(strategyKey);

    await Promise.all(
      openOrders.map(async (order) => {
        try {
          const result =
            await this.exchangeConnectorAdapterService?.cancelOrder(
              order.exchange,
              order.pair,
              order.exchangeOrderId,
              order.accountLabel,
            );
          const cancelSucceeded = this.isCancelResultFinal(result);

          this.exchangeOrderTrackerService?.upsertOrder(
            cancelSucceeded
              ? {
                  ...order,
                  status: 'cancelled',
                  updatedAt: getRFC3339Timestamp(),
                }
              : {
                  ...order,
                  status: 'pending_cancel',
                  updatedAt: getRFC3339Timestamp(),
                },
          );
        } catch (error) {
          if (this.isIdempotentCancelError(error)) {
            this.exchangeOrderTrackerService?.upsertOrder({
              ...order,
              status: 'cancelled',
              updatedAt: getRFC3339Timestamp(),
            });

            return;
          }

          this.mmLog.warn(
            'order cleanup failed',
            {
              reason: 'cancel_all_failed',
              strategy: strategyKey,
              exchange: order.exchange,
              pair: order.pair,
              account: order.accountLabel || 'default',
              order: order.exchangeOrderId,
              error: error instanceof Error ? error.message : String(error),
            },
            {
              onceKey: `shutdown-cancel:${strategyKey}:${order.exchangeOrderId}`,
              windowMs: 60_000,
            },
          );
        }
      }),
    );

    await this.waitForTrackedOrdersToSettle(strategyKey, timeoutMs);
  }

  getCancelableTrackedOrders(strategyKey: string): TrackedOrder[] {
    const trackedOrders =
      ((this.exchangeOrderTrackerService as any)?.getTrackedOrders?.(
        strategyKey,
      ) as TrackedOrder[]) ||
      this.exchangeOrderTrackerService?.getOpenOrders(strategyKey) ||
      [];

    return trackedOrders.filter(
      (order) =>
        order?.exchangeOrderId &&
        !this.isTrackedOrderTerminal(String(order.status || '')),
    );
  }

  async waitForTrackedOrdersToSettle(
    strategyKey: string,
    timeoutMs: number,
  ): Promise<void> {
    if (
      !this.exchangeOrderTrackerService ||
      !this.exchangeConnectorAdapterService ||
      timeoutMs <= 0
    ) {
      return;
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const pendingOrders = this.getCancelableTrackedOrders(strategyKey);

      if (pendingOrders.length === 0) {
        return;
      }

      await Promise.all(
        pendingOrders.map(async (order) => {
          try {
            const latest: Awaited<
              ReturnType<ExchangeConnectorAdapterService['fetchOrder']>
            > = this.runtimeTimingService
              ? await this.runtimeTimingService.measureAsync(
                  'strategy.fetch-order',
                  {
                    accountLabel: order.accountLabel || 'default',
                    exchange: order.exchange,
                    exchangeOrderId: order.exchangeOrderId,
                    pair: order.pair,
                    reason: 'shutdown-settle',
                  },
                  () =>
                    this.exchangeConnectorAdapterService?.fetchOrder(
                      order.exchange,
                      order.pair,
                      order.exchangeOrderId,
                      order.accountLabel,
                    ) as Promise<
                      Awaited<
                        ReturnType<
                          ExchangeConnectorAdapterService['fetchOrder']
                        >
                      >
                    >,
                  { warnThresholdMs: 500 },
                )
              : await this.exchangeConnectorAdapterService?.fetchOrder(
                  order.exchange,
                  order.pair,
                  order.exchangeOrderId,
                  order.accountLabel,
                );

            if (!latest) {
              return;
            }

            this.exchangeOrderTrackerService?.upsertOrder({
              ...order,
              clientOrderId:
                this.readString(latest?.clientOrderId || latest?.clientOid) ||
                order.clientOrderId,
              cumulativeFilledQty: this.readString(
                latest?.filled,
                order.cumulativeFilledQty || '0',
              ),
              status:
                this.normalizeExchangeOrderStatus(latest?.status) ||
                order.status,
              updatedAt: getRFC3339Timestamp(),
            });
          } catch {
            return;
          }
        }),
      );

      await this.sleep(200);
    }
  }

  async forceTrackedOrdersTerminal(
    strategyKey: string,
    status: TrackedOrder['status'] = 'cancelled',
  ): Promise<void> {
    const trackedOrders = this.getCancelableTrackedOrders(strategyKey);

    for (const order of trackedOrders) {
      this.exchangeOrderTrackerService?.upsertOrder({
        ...order,
        status,
        updatedAt: getRFC3339Timestamp(),
      });
    }
  }

  async isOrderOwnedByStrategy(
    strategy: StrategyInstance,
    clientOrderId: string,
    exchangeOrderId: string,
  ): Promise<boolean> {
    const strategyOrderId = this.readString(
      strategy.marketMakingOrderId,
      strategy.clientId,
    );

    if (!strategyOrderId || !this.exchangeOrderMappingService) {
      return false;
    }

    if (clientOrderId) {
      const byClientOrderId =
        await this.exchangeOrderMappingService.findByClientOrderId(
          clientOrderId,
        );

      if (this.isStrategyOrderScope(byClientOrderId?.orderId, strategyOrderId)) {
        return true;
      }
    }

    if (exchangeOrderId) {
      const byExchangeOrderId =
        await this.exchangeOrderMappingService.findByExchangeOrderId(
          exchangeOrderId,
        );

      if (
        this.isStrategyOrderScope(byExchangeOrderId?.orderId, strategyOrderId)
      ) {
        return true;
      }
    }

    return false;
  }

  private isStrategyOrderScope(
    mappedOrderId: string | undefined,
    strategyOrderId: string,
  ): boolean {
    if (!mappedOrderId) {
      return false;
    }

    return (
      mappedOrderId === strategyOrderId ||
      mappedOrderId.startsWith(`${strategyOrderId}:`)
    );
  }

  async cancelRecoveredExchangeOrder(
    strategy: StrategyInstance,
    exchange: string,
    pair: string,
    exchangeOrderId: string,
    clientOrderId: string,
    openOrder: Record<string, any>,
    accountLabel?: string,
  ): Promise<void> {
    try {
      const result = await this.exchangeConnectorAdapterService?.cancelOrder(
        exchange,
        pair,
        exchangeOrderId,
        accountLabel,
      );
      const nextStatus = this.isCancelResultFinal(result)
        ? 'cancelled'
        : 'pending_cancel';

      this.exchangeOrderTrackerService?.upsertOrder({
        orderId: this.readString(
          strategy.marketMakingOrderId,
          strategy.clientId,
        ),
        strategyKey: strategy.strategyKey,
        exchange,
        accountLabel,
        pair,
        exchangeOrderId,
        clientOrderId: clientOrderId || undefined,
        side: openOrder?.side === 'sell' ? 'sell' : 'buy',
        price: this.readString(openOrder?.price, '0'),
        qty: this.readString(openOrder?.amount || openOrder?.qty, '0'),
        cumulativeFilledQty: this.readString(openOrder?.filled, '0'),
        status: nextStatus,
        createdAt: getRFC3339Timestamp(),
        updatedAt: getRFC3339Timestamp(),
      });
    } catch (error) {
      if (this.isIdempotentCancelError(error)) {
        this.exchangeOrderTrackerService?.upsertOrder({
          orderId: this.readString(
            strategy.marketMakingOrderId,
            strategy.clientId,
          ),
          strategyKey: strategy.strategyKey,
          exchange,
          accountLabel,
          pair,
          exchangeOrderId,
          clientOrderId: clientOrderId || undefined,
          side: openOrder?.side === 'sell' ? 'sell' : 'buy',
          price: this.readString(openOrder?.price, '0'),
          qty: this.readString(openOrder?.amount || openOrder?.qty, '0'),
          cumulativeFilledQty: this.readString(openOrder?.filled, '0'),
          status: 'cancelled',
          createdAt: getRFC3339Timestamp(),
          updatedAt: getRFC3339Timestamp(),
        });

        return;
      }

      const message = error instanceof Error ? error.message : String(error);

      this.mmLog.warn(
        'order cleanup failed',
        {
          reason: 'startup_orphan_cancel_failed',
          strategy: strategy.strategyKey,
          exchange,
          pair,
          account: accountLabel || 'default',
          order: exchangeOrderId,
          error: message,
        },
        {
          onceKey: `startup-orphan-cancel:${strategy.strategyKey}:${exchangeOrderId}`,
          windowMs: 60_000,
        },
      );
    }
  }

  private isIdempotentCancelError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    const normalized = message.toLowerCase();

    return (
      normalized.includes('unknown order id') ||
      normalized.includes('order cancelled') ||
      normalized.includes('already cancelled') ||
      normalized.includes('order not found')
    );
  }

  isTrackedOrderTerminal(status: string): boolean {
    return ['filled', 'cancelled', 'failed'].includes(
      String(status || '').toLowerCase(),
    );
  }

  isCancelResultFinal(result: Record<string, unknown> | undefined) {
    const status = String(result?.status || '').toLowerCase();

    return (
      !status || !['new', 'open', 'pending', 'pending_cancel'].includes(status)
    );
  }

  normalizeExchangeOrderStatus(status: unknown): TrackedOrder['status'] | null {
    const normalized = String(status || '')
      .trim()
      .toLowerCase();

    if (!normalized) {
      return null;
    }
    if (normalized === 'open' || normalized === 'new') {
      return 'open';
    }
    if (
      normalized === 'partially_filled' ||
      normalized === 'partially-filled'
    ) {
      return 'partially_filled';
    }
    if (normalized === 'pending_cancel') {
      return 'pending_cancel';
    }
    if (normalized === 'closed' || normalized === 'filled') {
      return 'filled';
    }
    if (normalized === 'canceled' || normalized === 'cancelled') {
      return 'cancelled';
    }

    return 'failed';
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private readString(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return fallback;
  }
}
