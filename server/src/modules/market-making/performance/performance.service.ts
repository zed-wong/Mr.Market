import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { Performance } from 'src/common/entities/market-making/performance.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { Repository } from 'typeorm';

import { BalanceLedgerService } from '../ledger/balance-ledger.service';

export type OrderPerformancePoint = {
  t: string;
  realized: string;
  fees: string;
  net: string;
};

export type OrderPerformanceDto = {
  series: OrderPerformancePoint[];
  summary: {
    realizedPnlQuote: string;
    feesQuote: string;
    netPnlQuote: string;
    tradedQuoteVolume: string;
    effectiveSpreadBps: string | null;
    fillCount: number;
    inventoryBaseQty: string;
    inventoryCostQuote: string;
    inventoryAverageCostQuote: string | null;
    otherFees: Array<{ assetId: string; amount: string }>;
  };
  reconciliation?: {
    realizedPnlMatchesStored: boolean;
    storedRealizedPnlQuote?: string;
  };
};

type FillGroup = {
  eventKey: string;
  entries: LedgerEntry[];
  createdAt: string;
  entryId: string;
};

@Injectable()
export class PerformanceService {
  constructor(
    @InjectRepository(Performance)
    private readonly performanceRepository: Repository<Performance>,
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingOrderRepository: Repository<MarketMakingOrder>,
    private readonly balanceLedgerService: BalanceLedgerService,
    @Optional()
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository?: Repository<StrategyInstance>,
  ) {}

  async recordPerformance(data: Partial<Performance>): Promise<Performance> {
    const performance = this.performanceRepository.create(data);

    return this.performanceRepository.save(performance);
  }

  async getPerformanceByUserAndStrategy(
    userId: string,
    strategyType?: string,
  ): Promise<Performance[]> {
    const whereClause = strategyType ? { userId, strategyType } : { userId };

    return this.performanceRepository.find({ where: whereClause });
  }

  async getOrderPerformance(orderId: string): Promise<OrderPerformanceDto> {
    const order = await this.marketMakingOrderRepository.findOne({
      where: { orderId },
    });

    if (!order) {
      throw new NotFoundException('Market making order not found');
    }

    const pairAssets = this.parsePair(order.pair);
    const entries = await this.balanceLedgerService.findEntriesByUserOrderId(
      orderId,
    );
    const reversedEntryIds = new Set(
      entries
        .filter((entry) => entry.type === 'reversal' && entry.reversalOf)
        .map((entry) => String(entry.reversalOf)),
    );
    const fillGroups = this.groupFillEntries(
      entries.filter(
        (entry) =>
          !reversedEntryIds.has(entry.entryId) &&
          (entry.type === 'fill_settle' || entry.type === 'fee_debit'),
      ),
    );
    const otherFees = new Map<string, BigNumber>();
    const series: OrderPerformancePoint[] = [];
    let inventoryBaseQty = new BigNumber(0);
    let inventoryCostQuote = new BigNumber(0);
    let realizedPnlQuote = new BigNumber(0);
    let feesQuote = new BigNumber(0);
    let tradedQuoteVolume = new BigNumber(0);
    let fillCount = 0;

    for (const group of fillGroups) {
      const fillSettles = group.entries.filter(
        (entry) => entry.type === 'fill_settle',
      );
      const baseEntry = fillSettles.find(
        (entry) => entry.assetId === pairAssets.base,
      );
      const quoteEntry = fillSettles.find(
        (entry) => entry.assetId === pairAssets.quote,
      );

      if (!baseEntry || !quoteEntry) {
        continue;
      }

      const baseDelta = new BigNumber(baseEntry.amount);
      const quoteDelta = new BigNumber(quoteEntry.amount);

      if (
        !baseDelta.isFinite() ||
        !quoteDelta.isFinite() ||
        baseDelta.isZero() ||
        quoteDelta.isZero()
      ) {
        continue;
      }

      const qty = baseDelta.abs();
      const price = quoteDelta.abs().dividedBy(qty);

      if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
        continue;
      }

      const side = baseDelta.isGreaterThan(0) ? 'buy' : 'sell';
      const fillNotional = price.multipliedBy(qty);

      if (side === 'buy') {
        inventoryBaseQty = inventoryBaseQty.plus(qty);
        inventoryCostQuote = inventoryCostQuote.plus(fillNotional);
      } else {
        const matchedQty = BigNumber.min(qty, inventoryBaseQty);

        if (matchedQty.isGreaterThan(0) && inventoryBaseQty.isGreaterThan(0)) {
          const averageCost = inventoryCostQuote.dividedBy(inventoryBaseQty);
          const matchedCost = averageCost.multipliedBy(matchedQty);
          const matchedProceeds = price.multipliedBy(matchedQty);

          realizedPnlQuote = realizedPnlQuote.plus(
            matchedProceeds.minus(matchedCost),
          );
          inventoryBaseQty = inventoryBaseQty.minus(matchedQty);
          inventoryCostQuote = BigNumber.max(
            inventoryCostQuote.minus(matchedCost),
            0,
          );
        }
      }

      tradedQuoteVolume = tradedQuoteVolume.plus(fillNotional);
      fillCount += 1;

      for (const feeEntry of group.entries.filter(
        (entry) => entry.type === 'fee_debit',
      )) {
        const feeAmount = new BigNumber(feeEntry.amount).abs();

        if (!feeAmount.isFinite() || feeAmount.isZero()) {
          continue;
        }

        if (feeEntry.assetId === pairAssets.quote) {
          feesQuote = feesQuote.plus(feeAmount);
        } else if (feeEntry.assetId === pairAssets.base) {
          feesQuote = feesQuote.plus(feeAmount.multipliedBy(price));
        } else {
          otherFees.set(
            feeEntry.assetId,
            (otherFees.get(feeEntry.assetId) || new BigNumber(0)).plus(
              feeAmount,
            ),
          );
        }
      }

      series.push({
        t: group.createdAt,
        realized: realizedPnlQuote.toFixed(),
        fees: feesQuote.toFixed(),
        net: realizedPnlQuote.minus(feesQuote).toFixed(),
      });
    }

    const displayedQuoteVolume =
      (await this.readDualAccountMatchedQuoteVolume(order)) ??
      tradedQuoteVolume;
    const storedRealizedPnlQuote = this.readStoredRealizedPnlQuote(order);
    const result: OrderPerformanceDto = {
      series: this.downsampleSeries(series, 240),
      summary: {
        realizedPnlQuote: realizedPnlQuote.toFixed(),
        feesQuote: feesQuote.toFixed(),
        netPnlQuote: realizedPnlQuote.minus(feesQuote).toFixed(),
        tradedQuoteVolume: displayedQuoteVolume.toFixed(),
        effectiveSpreadBps: displayedQuoteVolume.isGreaterThan(0)
          ? realizedPnlQuote
              .dividedBy(displayedQuoteVolume)
              .multipliedBy(10000)
              .toFixed()
          : null,
        fillCount,
        inventoryBaseQty: inventoryBaseQty.toFixed(),
        inventoryCostQuote: inventoryCostQuote.toFixed(),
        inventoryAverageCostQuote: inventoryBaseQty.isGreaterThan(0)
          ? inventoryCostQuote.dividedBy(inventoryBaseQty).toFixed()
          : null,
        otherFees: [...otherFees.entries()].map(([assetId, amount]) => ({
          assetId,
          amount: amount.toFixed(),
        })),
      },
    };

    if (storedRealizedPnlQuote !== null) {
      result.reconciliation = {
        realizedPnlMatchesStored: realizedPnlQuote.isEqualTo(
          storedRealizedPnlQuote,
        ),
        storedRealizedPnlQuote: storedRealizedPnlQuote.toFixed(),
      };
    }

    return result;
  }

  private groupFillEntries(entries: LedgerEntry[]): FillGroup[] {
    const groups = new Map<string, FillGroup>();

    for (const entry of entries) {
      const eventKey = this.extractFillEventKey(entry);

      if (!eventKey) {
        continue;
      }

      const existing = groups.get(eventKey);

      if (!existing) {
        groups.set(eventKey, {
          eventKey,
          entries: [entry],
          createdAt: entry.createdAt,
          entryId: entry.entryId,
        });
        continue;
      }

      existing.entries.push(entry);
      if (
        entry.createdAt.localeCompare(existing.createdAt) < 0 ||
        (entry.createdAt === existing.createdAt &&
          entry.entryId.localeCompare(existing.entryId) < 0)
      ) {
        existing.createdAt = entry.createdAt;
        existing.entryId = entry.entryId;
      }
    }

    return [...groups.values()].sort((a, b) => {
      const createdAtOrder = a.createdAt.localeCompare(b.createdAt);

      if (createdAtOrder !== 0) {
        return createdAtOrder;
      }

      return a.entryId.localeCompare(b.entryId);
    });
  }

  private extractFillEventKey(entry: LedgerEntry): string | null {
    const key = String(entry.idempotencyKey || '');

    if (!key.startsWith('mm-fill:')) {
      return null;
    }

    const feeIndex = key.lastIndexOf(':fee:');

    if (feeIndex > -1) {
      return key.slice(0, feeIndex);
    }

    if (key.endsWith(':base') || key.endsWith(':quote')) {
      return key.slice(0, key.lastIndexOf(':'));
    }

    return null;
  }

  private downsampleSeries(
    series: OrderPerformancePoint[],
    maxPoints: number,
  ): OrderPerformancePoint[] {
    if (series.length <= maxPoints) {
      return series;
    }

    const sampled: OrderPerformancePoint[] = [];
    const lastIndex = series.length - 1;

    for (let index = 0; index < maxPoints; index += 1) {
      sampled.push(series[Math.round((index * lastIndex) / (maxPoints - 1))]);
    }

    return sampled;
  }

  private parsePair(pair: string): { base: string; quote: string } {
    const [base, quote] = String(pair || '').split('/');

    return {
      base: String(base || '').trim(),
      quote: String(quote || '').trim(),
    };
  }

  private async readDualAccountMatchedQuoteVolume(
    order: MarketMakingOrder,
  ): Promise<BigNumber | null> {
    if (!this.isEfficientDualAccountOrder(order)) {
      return null;
    }

    const strategyInstance = await this.strategyInstanceRepository?.findOne({
      where: { marketMakingOrderId: order.orderId },
    });
    const instanceVolume = this.toFiniteBigNumber(
      strategyInstance?.parameters?.totalMatchedQuoteVolume,
    );

    if (instanceVolume) {
      return instanceVolume;
    }

    return this.toFiniteBigNumber(
      order.strategySnapshot?.resolvedConfig?.totalMatchedQuoteVolume,
    );
  }

  private isEfficientDualAccountOrder(order: MarketMakingOrder): boolean {
    const snapshot = order.strategySnapshot;
    const resolvedConfig = snapshot?.resolvedConfig || {};

    return (
      snapshot?.controllerType === 'efficientDualAccountVolume' ||
      snapshot?.definitionKey === 'efficient-dual-account-volume' ||
      resolvedConfig.strategyContract === 'efficientDualAccountVolume'
    );
  }

  private toFiniteBigNumber(value: unknown): BigNumber | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const decimal = new BigNumber(String(value));

    return decimal.isFinite() && decimal.isGreaterThanOrEqualTo(0)
      ? decimal
      : null;
  }

  private readStoredRealizedPnlQuote(
    order: MarketMakingOrder,
  ): BigNumber | null {
    const value = order.strategySnapshot?.resolvedConfig?.realizedPnlQuote;

    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = new BigNumber(String(value));

    return parsed.isFinite() ? parsed : null;
  }
}
