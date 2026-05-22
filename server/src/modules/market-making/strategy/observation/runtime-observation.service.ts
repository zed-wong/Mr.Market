import { Injectable } from '@nestjs/common';

import { StrategyOrderIntent } from '../config/strategy-intent.types';

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
  observedAtMs: number;
};

@Injectable()
export class RuntimeObservationService {
  private readonly failures: IntentFailureObservation[] = [];
  private readonly maxRetentionMs = 10 * 60 * 1000;

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

  private isPostOnlyReject(item: IntentFailureObservation): boolean {
    const message = item.message.toLowerCase();

    return (
      item.intentType === 'CREATE_LIMIT_ORDER' &&
      (item.postOnly ||
        message.includes('post only') ||
        message.includes('post-only') ||
        message.includes('maker'))
    );
  }

  private isRateLimit(item: IntentFailureObservation): boolean {
    const message = item.message.toLowerCase();

    return (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('429') ||
      message.includes('throttle') ||
      message.includes('timeout')
    );
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
