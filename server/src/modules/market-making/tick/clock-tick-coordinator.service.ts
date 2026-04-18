import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { TickComponent } from './tick-component.interface';
import { MarketMakingRuntimeTimingService } from './runtime-timing.service';

type RegisteredTickComponent = {
  id: string;
  order: number;
  component: TickComponent;
};

@Injectable()
export class ClockTickCoordinatorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new CustomLogger(ClockTickCoordinatorService.name);
  private readonly skipTickWarnIntervalMs = 30000;
  private readonly tickSizeMs: number;
  private readonly components = new Map<string, RegisteredTickComponent>();
  private intervalId?: NodeJS.Timeout;
  private running = false;
  private tickInProgress = false;
  private tickStartedAtMs?: number;
  private skippedTickCount = 0;
  private skippedTickBurstStartedAtMs?: number;
  private lastSkipTickWarnAtMs?: number;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    private readonly runtimeTimingService?: MarketMakingRuntimeTimingService,
  ) {
    this.tickSizeMs = Number(
      this.configService.get('strategy.tick_size_ms', 1000),
    );
  }

  register(id: string, component: TickComponent, order: number): void {
    this.components.set(id, { id, order, component });
  }

  unregister(id: string): void {
    this.components.delete(id);
  }

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    for (const item of this.getSortedComponents()) {
      await item.component.start();
    }

    this.intervalId = setInterval(() => {
      void this.tickOnce();
    }, this.tickSizeMs);
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    while (this.tickInProgress) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    for (const item of [...this.getSortedComponents()].reverse()) {
      await item.component.stop();
    }
  }

  async tickOnce(): Promise<void> {
    if (this.tickInProgress) {
      const now = Date.now();

      this.skippedTickCount += 1;
      this.skippedTickBurstStartedAtMs =
        this.skippedTickBurstStartedAtMs ?? now;
      const runningDurationMs = this.tickStartedAtMs
        ? now - this.tickStartedAtMs
        : undefined;

      if (
        !this.lastSkipTickWarnAtMs ||
        now - this.lastSkipTickWarnAtMs >= this.skipTickWarnIntervalMs
      ) {
        this.lastSkipTickWarnAtMs = now;
        this.logger.warn(
          [
            'Tick overlap detected',
            `skippedCount=${this.skippedTickCount}`,
            `runningDurationMs=${runningDurationMs ?? 'n/a'}`,
            `tickSizeMs=${this.tickSizeMs}`,
          ].join(' | '),
        );
      }

      return;
    }

    this.tickInProgress = true;
    this.tickStartedAtMs = Date.now();
    const ts = getRFC3339Timestamp();
    const componentTimings: Array<{
      id: string;
      healthy: boolean;
      healthCheckDurationMs: number;
      onTickDurationMs: number;
      totalDurationMs: number;
    }> = [];

    try {
      for (const item of this.getSortedComponents()) {
        if (!this.running) {
          this.logger.log('Tick aborted: coordinator stopped mid-tick');
          break;
        }

        const componentStartedAtMs = Date.now();
        let healthy = false;
        let healthCheckDurationMs = 0;
        let onTickDurationMs = 0;

        try {
          const healthCheckStartedAtMs = Date.now();
          const isHealthy = await item.component.health();
          healthCheckDurationMs = Date.now() - healthCheckStartedAtMs;
          healthy = isHealthy;

          if (!isHealthy) {
            this.logger.warn(`Skipping unhealthy tick component: ${item.id}`);
            continue;
          }

          const onTickStartedAtMs = Date.now();
          await item.component.onTick(ts);
          onTickDurationMs = Date.now() - onTickStartedAtMs;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const trace = error instanceof Error ? error.stack : undefined;

          this.logger.error(
            `Tick component failed: ${item.id} ts=${ts}: ${message}`,
            trace,
          );
        } finally {
          const totalDurationMs = Date.now() - componentStartedAtMs;

          componentTimings.push({
            id: item.id,
            healthy,
            healthCheckDurationMs,
            onTickDurationMs,
            totalDurationMs,
          });
          this.runtimeTimingService?.recordDuration(
            'coordinator.component',
            totalDurationMs,
            {
              componentId: item.id,
              healthy,
              healthCheckDurationMs,
              onTickDurationMs,
              tickTs: ts,
            },
            { warnThresholdMs: this.tickSizeMs },
          );
        }
      }
    } finally {
      const tickFinishedAtMs = Date.now();
      const tickDurationMs = this.tickStartedAtMs
        ? tickFinishedAtMs - this.tickStartedAtMs
        : undefined;
      const componentDurationMs = componentTimings.reduce(
        (sum, timing) => sum + timing.totalDurationMs,
        0,
      );
      const coordinatorOverheadMs =
        tickDurationMs !== undefined
          ? Math.max(0, tickDurationMs - componentDurationMs)
          : undefined;

      if (tickDurationMs !== undefined) {
        this.runtimeTimingService?.recordDuration(
          'coordinator.tick',
          tickDurationMs,
          {
            componentCount: componentTimings.length,
            componentDurationMs,
            coordinatorOverheadMs,
            skippedTickCount: this.skippedTickCount,
            tickSizeMs: this.tickSizeMs,
            tickTs: ts,
          },
          { warnThresholdMs: this.tickSizeMs },
        );
      }

      if (this.skippedTickCount > 0) {
        const overlapWindowMs = this.skippedTickBurstStartedAtMs
          ? tickFinishedAtMs - this.skippedTickBurstStartedAtMs
          : undefined;

        this.logger.warn(
          [
            'Tick completed after overlap pressure',
            `skippedCount=${this.skippedTickCount}`,
            `tickDurationMs=${tickDurationMs ?? 'n/a'}`,
            `overlapWindowMs=${overlapWindowMs ?? 'n/a'}`,
            `tickSizeMs=${this.tickSizeMs}`,
          ].join(' | '),
        );
      }

      this.tickInProgress = false;
      this.tickStartedAtMs = undefined;
      this.skippedTickCount = 0;
      this.skippedTickBurstStartedAtMs = undefined;
      this.lastSkipTickWarnAtMs = undefined;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private getSortedComponents(): RegisteredTickComponent[] {
    return [...this.components.values()].sort((a, b) => a.order - b.order);
  }
}
