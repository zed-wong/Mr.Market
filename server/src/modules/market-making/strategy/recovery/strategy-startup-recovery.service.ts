import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { ExchangeOrderMappingService } from '../../execution/exchange-order-mapping.service';
import { BalanceLedgerService } from '../../ledger/balance-ledger.service';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';

@Injectable()
export class StrategyStartupRecoveryService {
  private readonly logger = new CustomLogger(
    StrategyStartupRecoveryService.name,
  );

  constructor(
    private readonly strategyIntentStoreService: StrategyIntentStoreService,
    private readonly balanceLedgerService: BalanceLedgerService,
    private readonly exchangeOrderMappingService: ExchangeOrderMappingService,
  ) {}

  async recoverInterruptedCreateIntentReservations(
    strategy: StrategyInstance,
    openOrders: any[],
  ): Promise<void> {
    const strategyOrderId = this.readString(
      strategy.marketMakingOrderId,
      strategy.clientId,
    );

    if (!strategyOrderId) {
      return;
    }

    const interruptedIntents =
      await this.strategyIntentStoreService.listInterruptedCreateIntents(
        strategy.strategyKey,
      );

    if (interruptedIntents.length === 0) {
      return;
    }

    for (const openOrder of openOrders) {
      const exchangeOrderId = this.readString(openOrder?.id);
      const clientOrderId = this.readString(
        openOrder?.clientOrderId || openOrder?.clientOid,
      );

      if (
        await this.isOrderOwnedByStrategy(
          strategyOrderId,
          clientOrderId,
          exchangeOrderId,
        )
      ) {
        this.logger.warn(
          `Skipped interrupted intent recovery for ${strategy.strategyKey}: open exchange order still belongs to strategy`,
        );

        return;
      }
    }

    for (const intent of interruptedIntents) {
      if (this.readString(intent.mixinOrderId)) {
        continue;
      }

      const reservation = this.calculateLimitOrderReservation(
        intent.pair,
        intent.side as 'buy' | 'sell',
        intent.price,
        intent.qty,
      );

      if (!reservation) {
        continue;
      }

      try {
        await this.balanceLedgerService.unlockFunds({
          orderId: strategyOrderId,
          userId: intent.userId,
          assetId: reservation.assetId,
          amount: reservation.amount,
          idempotencyKey: `reserve-release:${intent.intentId}:interrupted_intent_recovery`,
          refType: 'interrupted_intent_recovery',
          refId: intent.intentId,
        });
        await this.strategyIntentStoreService.updateIntentStatus(
          intent.intentId,
          'CANCELLED',
          'interrupted create intent recovered on startup',
        );
        this.logger.warn(
          `Recovered interrupted create intent ${intent.intentId} for ${strategy.strategyKey} by releasing its reservation`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed interrupted intent recovery for ${intent.intentId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async isOrderOwnedByStrategy(
    strategyOrderId: string,
    clientOrderId: string,
    exchangeOrderId: string,
  ): Promise<boolean> {
    if (clientOrderId) {
      const byClientOrderId =
        await this.exchangeOrderMappingService.findByClientOrderId(
          clientOrderId,
        );

      if (byClientOrderId?.orderId === strategyOrderId) {
        return true;
      }
    }

    if (exchangeOrderId) {
      const byExchangeOrderId =
        await this.exchangeOrderMappingService.findByExchangeOrderId(
          exchangeOrderId,
        );

      if (byExchangeOrderId?.orderId === strategyOrderId) {
        return true;
      }
    }

    return false;
  }

  private calculateLimitOrderReservation(
    pair: string,
    side: 'buy' | 'sell',
    priceValue: string,
    qtyValue: string,
  ): { assetId: string; amount: string } | null {
    const [baseAssetId, quoteAssetId] = String(pair || '').split('/');

    if (!baseAssetId || !quoteAssetId) {
      return null;
    }

    const qty = new BigNumber(qtyValue);
    const price = new BigNumber(priceValue);

    if (
      !qty.isFinite() ||
      qty.isLessThanOrEqualTo(0) ||
      !price.isFinite() ||
      price.isLessThanOrEqualTo(0)
    ) {
      return null;
    }

    if (side === 'sell') {
      return { assetId: baseAssetId, amount: qty.toFixed() };
    }

    return {
      assetId: quoteAssetId,
      amount: qty.multipliedBy(price).toFixed(),
    };
  }

  private readString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }

    return '';
  }
}
