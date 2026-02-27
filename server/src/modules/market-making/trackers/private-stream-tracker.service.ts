import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';

import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { TickComponent } from '../tick/tick-component.interface';

type PrivateStreamEvent = {
  exchange: string;
  accountLabel: string;
  eventType: string;
  payload: Record<string, unknown>;
  receivedAt: string;
};

@Injectable()
export class PrivateStreamTrackerService
  implements TickComponent, OnModuleInit, OnModuleDestroy
{
  private readonly queue: PrivateStreamEvent[] = [];
  private readonly latestByKey = new Map<string, PrivateStreamEvent>();

  constructor(
    @Optional()
    private readonly clockTickCoordinatorService?: ClockTickCoordinatorService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.clockTickCoordinatorService?.register(
      'private-stream-tracker',
      this,
      2,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.clockTickCoordinatorService?.unregister('private-stream-tracker');
  }

  async start(): Promise<void> {
    return;
  }

  async stop(): Promise<void> {
    this.queue.length = 0;
  }

  async health(): Promise<boolean> {
    return true;
  }

  queueAccountEvent(event: PrivateStreamEvent): void {
    this.queue.push(event);
  }

  getLatestEvent(
    exchange: string,
    accountLabel: string,
  ): PrivateStreamEvent | undefined {
    return this.latestByKey.get(this.toKey(exchange, accountLabel));
  }

  async onTick(_: string): Promise<void> {
    while (this.queue.length > 0) {
      const event = this.queue.shift();

      if (!event) {
        continue;
      }
      this.latestByKey.set(
        this.toKey(event.exchange, event.accountLabel),
        event,
      );
    }
  }

  private toKey(exchange: string, accountLabel: string): string {
    return `${exchange}:${accountLabel}`;
  }
}
