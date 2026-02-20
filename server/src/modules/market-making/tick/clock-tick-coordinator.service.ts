import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { TickComponent } from './tick-component.interface';

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
  private readonly tickSizeMs: number;
  private readonly components = new Map<string, RegisteredTickComponent>();
  private intervalId?: NodeJS.Timeout;
  private running = false;
  private tickInProgress = false;

  constructor(private readonly configService: ConfigService) {
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

    for (const item of [...this.getSortedComponents()].reverse()) {
      await item.component.stop();
    }
  }

  async tickOnce(): Promise<void> {
    if (this.tickInProgress) {
      this.logger.warn(
        'Skipping tick because previous tick is still in progress',
      );

      return;
    }

    this.tickInProgress = true;
    const ts = getRFC3339Timestamp();

    try {
      for (const item of this.getSortedComponents()) {
        const isHealthy = await item.component.health();

        if (!isHealthy) {
          this.logger.warn(`Skipping unhealthy tick component: ${item.id}`);
          continue;
        }

        await item.component.onTick(ts);
      }
    } finally {
      this.tickInProgress = false;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private getSortedComponents(): RegisteredTickComponent[] {
    return [...this.components.values()].sort((a, b) => a.order - b.order);
  }
}
