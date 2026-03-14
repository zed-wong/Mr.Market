import {
  StrategyRuntimeSession,
  StrategyType,
} from '../config/strategy-controller.types';

export type ExchangePairFill = {
  orderId?: string;
  exchangeOrderId?: string | null;
  clientOrderId?: string | null;
  side?: 'buy' | 'sell';
  price?: string;
  qty?: string;
  receivedAt?: string;
  payload?: Record<string, unknown>;
};

export type ExchangePairExecutorOrderConfig = {
  strategyKey?: string;
  strategyType: StrategyType;
  clientId: string;
  cadenceMs: number;
  params: StrategyRuntimeSession['params'];
  marketMakingOrderId?: string;
  nextRunAtMs?: number;
  runId?: string;
};

export type ExchangePairExecutorSession = StrategyRuntimeSession & {
  orderId: string;
  exchange: string;
  pair: string;
};

export type ExchangePairExecutorHandlers = {
  onTick?(
    session: ExchangePairExecutorSession,
    ts: string,
  ): Promise<void> | void;
  onTickError?(
    session: ExchangePairExecutorSession,
    error: unknown,
    ts: string,
  ): Promise<void> | void;
  onFill?(
    session: ExchangePairExecutorSession,
    fill: ExchangePairFill,
  ): Promise<void> | void;
  onFillError?(
    session: ExchangePairExecutorSession,
    error: unknown,
    fill: ExchangePairFill,
  ): Promise<void> | void;
};

export class ExchangePairExecutor {
  private readonly strategySessions = new Map<
    string,
    ExchangePairExecutorSession
  >();
  private handlers: ExchangePairExecutorHandlers;

  constructor(
    readonly exchange: string,
    readonly pair: string,
    handlers: ExchangePairExecutorHandlers = {},
  ) {
    this.handlers = handlers;
  }

  configure(handlers: ExchangePairExecutorHandlers): void {
    this.handlers = {
      ...this.handlers,
      ...handlers,
    };
  }

  async addOrder(
    orderId: string,
    userId: string,
    config: ExchangePairExecutorOrderConfig,
  ): Promise<ExchangePairExecutorSession> {
    const session: ExchangePairExecutorSession = {
      orderId,
      exchange: this.exchange,
      pair: this.pair,
      runId: config.runId || this.generateRunId(),
      strategyKey: config.strategyKey || orderId,
      strategyType: config.strategyType,
      userId,
      clientId: config.clientId,
      marketMakingOrderId: config.marketMakingOrderId ?? orderId,
      cadenceMs: Math.max(0, Number(config.cadenceMs || 0)),
      nextRunAtMs: config.nextRunAtMs ?? Date.now(),
      params: config.params || {},
    };

    this.strategySessions.set(orderId, session);

    return session;
  }

  async removeOrder(orderId: string): Promise<void> {
    this.strategySessions.delete(orderId);
  }

  getSession(orderId: string): ExchangePairExecutorSession | undefined {
    return this.strategySessions.get(orderId);
  }

  getActiveSessions(): ExchangePairExecutorSession[] {
    return [...this.strategySessions.values()].sort((a, b) =>
      a.strategyKey.localeCompare(b.strategyKey),
    );
  }

  isEmpty(): boolean {
    return this.strategySessions.size === 0;
  }

  async onTick(ts: string): Promise<void> {
    const nowMs = Date.now();
    const sessions = this.getActiveSessions();

    for (const session of sessions) {
      const capturedRunId = session.runId;

      if (session.nextRunAtMs > nowMs) {
        continue;
      }

      const activeSession = this.strategySessions.get(session.orderId);

      if (!activeSession || activeSession.runId !== capturedRunId) {
        continue;
      }

      try {
        await this.handlers.onTick?.(session, ts);
      } catch (error) {
        await this.handlers.onTickError?.(session, error, ts);
      } finally {
        const nextSession = this.strategySessions.get(session.orderId);

        if (nextSession && nextSession.runId === capturedRunId) {
          nextSession.nextRunAtMs += nextSession.cadenceMs;
          this.strategySessions.set(session.orderId, nextSession);
        }
      }
    }
  }

  async onFill(fill: ExchangePairFill): Promise<void> {
    const sessions = fill.orderId
      ? [this.strategySessions.get(fill.orderId)].filter(
          (session): session is ExchangePairExecutorSession =>
            session !== undefined,
        )
      : this.getActiveSessions();

    for (const session of sessions) {
      try {
        await this.handlers.onFill?.(session, fill);
      } catch (error) {
        await this.handlers.onFillError?.(session, error, fill);
      }
    }
  }

  private generateRunId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
