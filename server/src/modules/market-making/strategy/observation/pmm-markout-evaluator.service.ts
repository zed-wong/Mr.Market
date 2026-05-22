import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { StrategyMarketDataProviderService } from '../data/strategy-market-data-provider.service';

export type PmmMarkoutFill = {
  strategyKey: string;
  exchangeName: string;
  pair: string;
  side: 'buy' | 'sell';
  price: string;
  qty?: string;
  observedAtMs: number;
  markoutWindowMs: number;
  guardBps: number;
  cooldownMs: number;
};

export type PmmToxicityState = {
  buyScore: number;
  sellScore: number;
  buyPausedUntilMs: number | null;
  sellPausedUntilMs: number | null;
  buyLastPausedUntilMs: number | null;
  sellLastPausedUntilMs: number | null;
};

type PendingMarkout = PmmMarkoutFill & {
  evaluateAtMs: number;
};

@Injectable()
export class PmmMarkoutEvaluatorService {
  private readonly logger = new CustomLogger(PmmMarkoutEvaluatorService.name);
  private readonly pending: PendingMarkout[] = [];
  private readonly toxicityByStrategy = new Map<string, PmmToxicityState>();

  constructor(
    private readonly marketDataProvider: StrategyMarketDataProviderService,
  ) {}

  recordFill(fill: PmmMarkoutFill): void {
    const price = new BigNumber(fill.price);
    const markoutWindowMs = Number(fill.markoutWindowMs || 0);
    const guardBps = Number(fill.guardBps || 0);

    if (
      !price.isFinite() ||
      price.isLessThanOrEqualTo(0) ||
      !Number.isFinite(markoutWindowMs) ||
      markoutWindowMs <= 0 ||
      !Number.isFinite(guardBps) ||
      guardBps <= 0
    ) {
      return;
    }

    this.pending.push({
      ...fill,
      markoutWindowMs,
      guardBps,
      cooldownMs: Math.max(0, Number(fill.cooldownMs || 0)),
      evaluateAtMs: fill.observedAtMs + markoutWindowMs,
    });
  }

  evaluateDue(nowMs = Date.now()): void {
    if (this.pending.length === 0) {
      return;
    }

    const stillPending: PendingMarkout[] = [];

    for (const fill of this.pending) {
      if (fill.evaluateAtMs > nowMs) {
        stillPending.push(fill);
        continue;
      }

      const markoutMid = this.findMarkoutMid(fill);

      if (markoutMid === null) {
        stillPending.push(fill);
        continue;
      }

      this.applyMarkout(fill, markoutMid, nowMs);
    }

    this.pending.length = 0;
    this.pending.push(...stillPending);
  }

  getToxicity(strategyKey: string, nowMs = Date.now()): PmmToxicityState {
    const state = this.toPublicState(this.getOrCreateState(strategyKey), nowMs);

    return { ...state };
  }

  clear(strategyKey?: string): void {
    if (strategyKey) {
      this.toxicityByStrategy.delete(strategyKey);
      for (let index = this.pending.length - 1; index >= 0; index -= 1) {
        if (this.pending[index].strategyKey === strategyKey) {
          this.pending.splice(index, 1);
        }
      }

      return;
    }

    this.pending.length = 0;
    this.toxicityByStrategy.clear();
  }

  private findMarkoutMid(fill: PendingMarkout): BigNumber | null {
    const history = this.marketDataProvider.getTrackedMidPriceHistory(
      fill.exchangeName,
      fill.pair,
      Math.max(fill.markoutWindowMs * 3, fill.markoutWindowMs + 1_000),
    );
    const sample = history.find((item) => item.ts >= fill.evaluateAtMs);

    if (!sample) {
      return null;
    }

    const mid = new BigNumber(sample.price);

    return mid.isFinite() && mid.isGreaterThan(0) ? mid : null;
  }

  private applyMarkout(
    fill: PendingMarkout,
    markoutMid: BigNumber,
    nowMs: number,
  ): void {
    const fillPrice = new BigNumber(fill.price);
    const threshold = new BigNumber(fill.guardBps).dividedBy(10_000);
    const move = markoutMid.minus(fillPrice).dividedBy(fillPrice);
    const adverse =
      fill.side === 'buy'
        ? move.isLessThanOrEqualTo(threshold.negated())
        : move.isGreaterThanOrEqualTo(threshold);
    const state = this.getOrCreateState(fill.strategyKey);
    const scoreKey = fill.side === 'buy' ? 'buyScore' : 'sellScore';
    const pauseKey =
      fill.side === 'buy' ? 'buyPausedUntilMs' : 'sellPausedUntilMs';

    if (adverse) {
      state[scoreKey] += 1;

      if (fill.cooldownMs > 0) {
        state[pauseKey] = Math.max(
          state[pauseKey] || 0,
          nowMs + fill.cooldownMs,
        );
      }

      this.logger.warn(
        `PMM adverse markout strategyKey=${fill.strategyKey} side=${
          fill.side
        } fillPrice=${fillPrice.toFixed()} markoutMid=${markoutMid.toFixed()} score=${
          state[scoreKey]
        }`,
      );

      return;
    }

    state[scoreKey] = Math.max(0, state[scoreKey] - 0.5);
  }

  private getOrCreateState(strategyKey: string): PmmToxicityState {
    const existing = this.toxicityByStrategy.get(strategyKey);

    if (existing) {
      return existing;
    }

    const state: PmmToxicityState = {
      buyScore: 0,
      sellScore: 0,
      buyPausedUntilMs: null,
      sellPausedUntilMs: null,
      buyLastPausedUntilMs: null,
      sellLastPausedUntilMs: null,
    };

    this.toxicityByStrategy.set(strategyKey, state);

    return state;
  }

  private toPublicState(
    state: PmmToxicityState,
    nowMs: number,
  ): PmmToxicityState {
    return {
      buyScore: state.buyScore,
      sellScore: state.sellScore,
      buyPausedUntilMs:
        state.buyPausedUntilMs && state.buyPausedUntilMs > nowMs
          ? state.buyPausedUntilMs
          : null,
      sellPausedUntilMs:
        state.sellPausedUntilMs && state.sellPausedUntilMs > nowMs
          ? state.sellPausedUntilMs
          : null,
      buyLastPausedUntilMs: state.buyPausedUntilMs || null,
      sellLastPausedUntilMs: state.sellPausedUntilMs || null,
    };
  }
}
