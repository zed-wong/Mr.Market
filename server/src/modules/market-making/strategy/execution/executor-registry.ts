import { Injectable } from '@nestjs/common';

import {
  ExchangePairExecutor,
  ExchangePairExecutorHandlers,
} from './exchange-pair-executor';

@Injectable()
export class ExecutorRegistry {
  private readonly executors = new Map<string, ExchangePairExecutor>();

  getOrCreateExecutor(
    exchange: string,
    pair: string,
    handlers: ExchangePairExecutorHandlers = {},
  ): ExchangePairExecutor {
    const key = this.toKey(exchange, pair);
    const existing = this.executors.get(key);

    if (existing) {
      existing.configure(handlers);

      return existing;
    }

    const executor = new ExchangePairExecutor(exchange, pair, handlers);

    this.executors.set(key, executor);

    return executor;
  }

  removeExecutorIfEmpty(exchange: string, pair: string): void {
    const key = this.toKey(exchange, pair);
    const executor = this.executors.get(key);

    if (!executor || !executor.isEmpty()) {
      return;
    }

    this.executors.delete(key);
  }

  getExecutor(
    exchange: string,
    pair: string,
  ): ExchangePairExecutor | undefined {
    return this.executors.get(this.toKey(exchange, pair));
  }

  getActiveExecutors(): ExchangePairExecutor[] {
    return [...this.executors.values()].sort((a, b) =>
      this.toKey(a.exchange, a.pair).localeCompare(
        this.toKey(b.exchange, b.pair),
      ),
    );
  }

  findExecutorByOrderId(orderId: string): ExchangePairExecutor | undefined {
    return this.getActiveExecutors().find((executor) =>
      Boolean(executor.getSession(orderId)),
    );
  }

  clear(): void {
    this.executors.clear();
  }

  private toKey(exchange: string, pair: string): string {
    return `${exchange.trim().toLowerCase()}:${pair.trim().toUpperCase()}`;
  }
}
