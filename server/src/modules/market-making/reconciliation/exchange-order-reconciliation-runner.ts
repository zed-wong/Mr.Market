import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { MarketMakingRuntimeTimingService } from '../tick/runtime-timing.service';
import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';

@Injectable()
export class ExchangeOrderReconciliationRunner
  implements OnModuleInit, OnModuleDestroy
{
  private static readonly LOOP_MS = 1_000;
  private static readonly JITTER_MS = 250;

  private readonly logger = new CustomLogger(
    ExchangeOrderReconciliationRunner.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly exchangeOrderTrackerService: ExchangeOrderTrackerService,
    @Optional()
    private readonly runtimeTimingService?: MarketMakingRuntimeTimingService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.stopped = false;
    this.scheduleNextPass();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async runNow(ts = getRFC3339Timestamp()): Promise<number> {
    if (this.running) {
      return 0;
    }

    this.running = true;
    const startedAtMs = Date.now();

    try {
      const processedCount = await this.exchangeOrderTrackerService.pollDueOrders(
        ts,
      );

      this.runtimeTimingService?.recordDuration(
        'order-reconciliation.pass',
        Date.now() - startedAtMs,
        {
          processedCount,
          ts,
        },
        { warnThresholdMs: 500 },
      );

      return processedCount;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trace = error instanceof Error ? error.stack : undefined;

      this.logger.error(`Reconciliation pass failed: ${message}`, trace);

      return 0;
    } finally {
      this.running = false;
    }
  }

  private scheduleNextPass(): void {
    if (this.stopped) {
      return;
    }

    this.timer = setTimeout(async () => {
      try {
        await this.runNow();
      } finally {
        this.scheduleNextPass();
      }
    }, this.nextDelayMs());
  }

  private nextDelayMs(): number {
    return (
      ExchangeOrderReconciliationRunner.LOOP_MS +
      Math.floor(Math.random() * ExchangeOrderReconciliationRunner.JITTER_MS)
    );
  }
}
