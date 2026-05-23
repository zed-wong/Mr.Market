import { Injectable, Optional } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { BalanceLedgerService } from '../../ledger/balance-ledger.service';

export type FillSettlementCommand = {
  strategyKey: string;
  orderId: string;
  userId: string;
  pair: string;
  fill: {
    exchangeOrderId?: string | null;
    clientOrderId?: string | null;
    fillId?: string | null;
    side?: 'buy' | 'sell';
    price?: string;
    qty?: string;
    cumulativeQty?: string;
    feeAmount?: string;
    feeAsset?: string;
  };
};

@Injectable()
export class FillSettlementService {
  private readonly logger = new CustomLogger(FillSettlementService.name);

  constructor(
    @Optional()
    private readonly balanceLedgerService?: BalanceLedgerService,
  ) {}

  async settleFill(command: FillSettlementCommand): Promise<boolean> {
    if (
      !this.balanceLedgerService ||
      !command.fill.side ||
      !command.fill.price ||
      !command.fill.qty
    ) {
      return false;
    }

    const assets = this.parseBaseQuote(command.pair);

    if (!assets) {
      this.logger.warn(
        `Skipping fill ledger update for strategyKey=${command.strategyKey}: pair is missing or unparseable`,
      );

      return false;
    }

    const price = new BigNumber(command.fill.price);
    const qty = new BigNumber(command.fill.qty);

    if (
      !price.isFinite() ||
      !qty.isFinite() ||
      price.isLessThanOrEqualTo(0) ||
      qty.isLessThanOrEqualTo(0)
    ) {
      this.logger.warn(
        `Skipping fill ledger update for strategyKey=${
          command.strategyKey
        }: invalid fill price/qty price=${command.fill.price || ''} qty=${
          command.fill.qty || ''
        }`,
      );

      return false;
    }

    const quoteAmount = price.multipliedBy(qty);
    const eventKey = this.buildFillLedgerEventKey(command);

    if (!eventKey) {
      this.logger.warn(
        `Skipping fill ledger update for strategyKey=${command.strategyKey}: missing canonical fill identity (need exchangeOrderId/clientOrderId AND cumulativeQty). exchangeOrderId=${
          command.fill.exchangeOrderId || ''
        } clientOrderId=${command.fill.clientOrderId || ''} cumulativeQty=${
          command.fill.cumulativeQty || ''
        } fillId=${command.fill.fillId || ''}`,
      );

      return false;
    }

    const baseDelta =
      command.fill.side === 'buy' ? qty.toFixed() : qty.negated().toFixed();
    const quoteDelta =
      command.fill.side === 'buy'
        ? quoteAmount.negated().toFixed()
        : quoteAmount.toFixed();

    await this.balanceLedgerService.adjust({
      orderId: command.orderId,
      userId: command.userId,
      assetId: assets.base,
      amount: baseDelta,
      idempotencyKey: `${eventKey}:base`,
      refType: 'market_making_fill',
      refId: this.resolveRefId(command),
    });

    await this.balanceLedgerService.adjust({
      orderId: command.orderId,
      userId: command.userId,
      assetId: assets.quote,
      amount: quoteDelta,
      idempotencyKey: `${eventKey}:quote`,
      refType: 'market_making_fill',
      refId: this.resolveRefId(command),
    });

    await this.applyFillFee(command, eventKey);

    return true;
  }

  private async applyFillFee(
    command: FillSettlementCommand,
    eventKey: string,
  ): Promise<void> {
    if (
      !this.balanceLedgerService ||
      !command.fill.feeAmount ||
      !command.fill.feeAsset
    ) {
      return;
    }

    const feeAmount = new BigNumber(command.fill.feeAmount);
    const feeAsset = String(command.fill.feeAsset || '').trim();

    if (
      !feeAsset ||
      !feeAmount.isFinite() ||
      feeAmount.isLessThanOrEqualTo(0)
    ) {
      this.logger.warn(
        `Skipping fill fee ledger update for strategyKey=${
          command.strategyKey
        }: invalid fee asset=${command.fill.feeAsset || ''} amount=${
          command.fill.feeAmount || ''
        }`,
      );

      return;
    }

    try {
      await this.balanceLedgerService.debitFee({
        orderId: command.orderId,
        userId: command.userId,
        assetId: feeAsset,
        amount: feeAmount.toFixed(),
        idempotencyKey: `${eventKey}:fee:${feeAsset}`,
        refType: 'market_making_fee',
        refId: this.resolveRefId(command),
      });
    } catch (error) {
      this.logger.warn(
        `Fill fee debit requires manual review for strategyKey=${
          command.strategyKey
        } asset=${feeAsset} amount=${feeAmount.toFixed()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private buildFillLedgerEventKey(
    command: FillSettlementCommand,
  ): string | null {
    const fill = command.fill;
    const cumulativeQty = this.normalizePositiveNumber(fill.cumulativeQty);
    const orderIdentity = fill.exchangeOrderId || fill.clientOrderId;

    if (!orderIdentity || !fill.side || !cumulativeQty) {
      return null;
    }

    return [
      'mm-fill',
      command.strategyKey,
      orderIdentity,
      fill.side,
      cumulativeQty,
    ].join(':');
  }

  private normalizePositiveNumber(value: unknown): string | null {
    const numericValue = new BigNumber(String(value ?? ''));

    if (!numericValue.isFinite() || numericValue.isLessThanOrEqualTo(0)) {
      return null;
    }

    return numericValue.toFixed();
  }

  private resolveRefId(command: FillSettlementCommand): string {
    return (
      command.fill.exchangeOrderId ||
      command.fill.clientOrderId ||
      command.strategyKey
    );
  }

  private parseBaseQuote(pair: string): { base: string; quote: string } | null {
    const [base, quote] = String(pair || '').split('/');

    if (!base || !quote) {
      return null;
    }

    return {
      base,
      quote,
    };
  }
}
