import { Injectable, Optional } from '@nestjs/common';
import BigNumber from 'bignumber.js';

import {
  classifyExchangeError,
  ExchangeErrorKind,
} from '../../execution/exchange-error-classifier';
import { PureMarketMakingStrategyDto } from '../config/strategy.dto';
import { StrategyRuntimeSession } from '../config/strategy-controller.types';
import { StrategyOrderIntent } from '../config/strategy-intent.types';
import { PmmMarkoutEvaluatorService } from './pmm-markout-evaluator.service';

export type StrategyRuntimePressureSnapshot = {
  strategyKey: string;
  windowMs: number;
  rejectCount: number;
  postOnlyRejectCount: number;
  rateLimitCount: number;
};

type IntentFailureObservation = {
  strategyKey: string;
  intentType: StrategyOrderIntent['type'];
  postOnly: boolean;
  message: string;
  exchangeErrorKind: ExchangeErrorKind;
  observedAtMs: number;
};

@Injectable()
export class RuntimeObservationService {
  private readonly failures: IntentFailureObservation[] = [];
  private readonly maxRetentionMs = 10 * 60 * 1000;

  constructor(
    @Optional()
    private readonly pmmMarkoutEvaluatorService?: PmmMarkoutEvaluatorService,
  ) {}

  recordIntentFailure(
    intent: StrategyOrderIntent,
    error: unknown,
    observedAtMs = Date.now(),
  ): void {
    this.failures.push({
      strategyKey: intent.strategyKey,
      intentType: intent.type,
      postOnly: Boolean(intent.postOnly),
      message: error instanceof Error ? error.message : String(error),
      exchangeErrorKind: classifyExchangeError(error).kind,
      observedAtMs,
    });
    this.prune(observedAtMs);
  }

  getPressure(
    strategyKey: string,
    windowMs: number,
    nowMs = Date.now(),
  ): StrategyRuntimePressureSnapshot {
    this.prune(nowMs);

    const cutoff = nowMs - Math.max(0, Number(windowMs || 0));
    const recent = this.failures.filter(
      (item) => item.strategyKey === strategyKey && item.observedAtMs >= cutoff,
    );

    return {
      strategyKey,
      windowMs,
      rejectCount: recent.length,
      postOnlyRejectCount: recent.filter((item) => this.isPostOnlyReject(item))
        .length,
      rateLimitCount: recent.filter((item) => this.isRateLimit(item)).length,
    };
  }

  clear(strategyKey?: string): void {
    if (!strategyKey) {
      this.failures.length = 0;

      return;
    }

    for (let index = this.failures.length - 1; index >= 0; index -= 1) {
      if (this.failures[index].strategyKey === strategyKey) {
        this.failures.splice(index, 1);
      }
    }
  }

  recordSessionPnL(
    session: StrategyRuntimeSession,
    fill: {
      side?: 'buy' | 'sell';
      price?: string;
      qty?: string;
    },
    options?: {
      includeTradedQuoteVolume?: boolean;
    },
  ): void {
    if (!fill.side || !fill.price || !fill.qty) {
      return;
    }

    const price = new BigNumber(fill.price);
    const qty = new BigNumber(fill.qty);

    if (
      !price.isFinite() ||
      !qty.isFinite() ||
      price.isLessThanOrEqualTo(0) ||
      qty.isLessThanOrEqualTo(0)
    ) {
      return;
    }

    const currentInventoryQty = new BigNumber(session.inventoryBaseQty || 0);
    const currentInventoryCost = new BigNumber(session.inventoryCostQuote || 0);
    const currentRealizedPnl = new BigNumber(session.realizedPnlQuote || 0);
    const includeTradedQuoteVolume = options?.includeTradedQuoteVolume ?? true;
    const currentTradedVolume = new BigNumber(session.tradedQuoteVolume || 0);
    const fillNotional = price.multipliedBy(qty);

    let nextInventoryQty = currentInventoryQty;
    let nextInventoryCost = currentInventoryCost;
    let nextRealizedPnl = currentRealizedPnl;

    if (fill.side === 'buy') {
      nextInventoryQty = currentInventoryQty.plus(qty);
      nextInventoryCost = currentInventoryCost.plus(fillNotional);
    } else {
      const matchedQty = BigNumber.min(qty, currentInventoryQty);

      if (matchedQty.isGreaterThan(0) && currentInventoryQty.isGreaterThan(0)) {
        const averageCost = currentInventoryCost.dividedBy(currentInventoryQty);
        const matchedCost = averageCost.multipliedBy(matchedQty);
        const matchedProceeds = price.multipliedBy(matchedQty);

        nextRealizedPnl = nextRealizedPnl.plus(
          matchedProceeds.minus(matchedCost),
        );
        nextInventoryQty = currentInventoryQty.minus(matchedQty);
        nextInventoryCost = BigNumber.max(
          currentInventoryCost.minus(matchedCost),
          0,
        );
      }
    }

    session.inventoryBaseQty = nextInventoryQty.toNumber();
    session.inventoryCostQuote = nextInventoryCost.toNumber();
    session.realizedPnlQuote = nextRealizedPnl.toNumber();
    if (includeTradedQuoteVolume) {
      session.tradedQuoteVolume = currentTradedVolume
        .plus(fillNotional)
        .toNumber();
    }
    session.params = {
      ...session.params,
      inventoryBaseQty: session.inventoryBaseQty,
      inventoryCostQuote: session.inventoryCostQuote,
      realizedPnlQuote: session.realizedPnlQuote,
      ...(includeTradedQuoteVolume
        ? {
            tradedQuoteVolume: session.tradedQuoteVolume,
          }
        : {}),
    };
  }

  recordPureMarketMakingMarkout(
    session: StrategyRuntimeSession,
    fill: {
      side?: 'buy' | 'sell';
      price?: string;
      qty?: string;
      receivedAt?: string;
    },
    fallbackObservedAtMs: number,
  ): void {
    if (
      session.strategyType !== 'pureMarketMaking' ||
      !this.pmmMarkoutEvaluatorService ||
      !fill.side ||
      !fill.price
    ) {
      return;
    }

    const params = session.params as unknown as PureMarketMakingStrategyDto;
    const guardBps = Number(params.adverseMarkoutGuardBps || 0);
    const markoutWindowMs = Number(params.adverseMarkoutWindowMs || 0);

    if (
      !Number.isFinite(guardBps) ||
      guardBps <= 0 ||
      !Number.isFinite(markoutWindowMs) ||
      markoutWindowMs <= 0
    ) {
      return;
    }

    const observedAtMs = fill.receivedAt
      ? Date.parse(fill.receivedAt)
      : fallbackObservedAtMs;

    this.pmmMarkoutEvaluatorService.recordFill({
      strategyKey: session.strategyKey,
      exchangeName: params.oracleExchangeName || params.exchangeName,
      pair: params.pair,
      side: fill.side,
      price: fill.price,
      qty: fill.qty,
      observedAtMs: Number.isFinite(observedAtMs)
        ? observedAtMs
        : fallbackObservedAtMs,
      markoutWindowMs,
      guardBps,
      cooldownMs: Number(params.adverseMarkoutCooldownMs || 0),
    });
  }

  private isPostOnlyReject(item: IntentFailureObservation): boolean {
    return (
      item.intentType === 'CREATE_LIMIT_ORDER' &&
      (item.postOnly ||
        item.exchangeErrorKind === 'ORDER_IMMEDIATELY_FILLABLE' ||
        item.exchangeErrorKind === 'ORDER_NOT_FILLABLE')
    );
  }

  private isRateLimit(item: IntentFailureObservation): boolean {
    return item.exchangeErrorKind === 'RATE_LIMIT';
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.maxRetentionMs;

    for (let index = this.failures.length - 1; index >= 0; index -= 1) {
      if (this.failures[index].observedAtMs < cutoff) {
        this.failures.splice(index, 1);
      }
    }
  }
}
