import type {
  StrategyRuntimeSession,
  StrategyType,
} from '../config/strategy-controller.types';

export type ExchangePairFill = {
  orderId?: string;
  exchangeOrderId?: string | null;
  clientOrderId?: string | null;
  fillId?: string | null;
  side?: 'buy' | 'sell';
  price?: string;
  qty?: string;
  cumulativeQty?: string;
  receivedAt?: string;
  payload?: Record<string, unknown>;
};

export type ExchangePairExecutorOrderConfig = {
  strategyKey: string;
  strategyType: StrategyType;
  clientId: string;
  cadenceMs: number;
  accountLabel?: string;
  params: StrategyRuntimeSession['params'];
  marketMakingOrderId?: string;
  nextRunAtMs?: number;
  runId?: string;
};

export type ExchangePairExecutorSession = StrategyRuntimeSession & {
  orderId: string;
  exchange: string;
  pair: string;
  accountLabel?: string;
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

type RecentErrorEntry = {
  ts: string;
  message: string;
};

export class ExchangePairExecutor {
  private readonly strategySessions = new Map<
    string,
    ExchangePairExecutorSession
  >();
  private readonly recentErrors = new Map<string, RecentErrorEntry[]>();
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
      strategyKey: config.strategyKey,
      strategyType: config.strategyType,
      userId,
      accountLabel:
        config.accountLabel ||
        (typeof config.params?.accountLabel === 'string'
          ? config.params.accountLabel
          : undefined),
      clientId: config.clientId,
      marketMakingOrderId: config.marketMakingOrderId ?? orderId,
      cadenceMs: Math.max(0, Number(config.cadenceMs || 0)),
      nextRunAtMs: config.nextRunAtMs ?? Date.now(),
      lastFillTimestamp:
        typeof config.params?.lastFillTimestamp === 'number'
          ? config.params.lastFillTimestamp
          : undefined,
      realizedPnlQuote:
        typeof config.params?.realizedPnlQuote === 'number'
          ? config.params.realizedPnlQuote
          : 0,
      tradedQuoteVolume:
        typeof config.params?.tradedQuoteVolume === 'number'
          ? config.params.tradedQuoteVolume
          : 0,
      inventoryBaseQty:
        typeof config.params?.inventoryBaseQty === 'number'
          ? config.params.inventoryBaseQty
          : 0,
      inventoryCostQuote:
        typeof config.params?.inventoryCostQuote === 'number'
          ? config.params.inventoryCostQuote
          : 0,
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

  getRecentErrors(orderId: string): RecentErrorEntry[] {
    return [...(this.recentErrors.get(orderId) || [])];
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
        this.recordRecentError(session.orderId, error, ts);
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
        this.recordRecentError(session.orderId, error, fill.receivedAt);
        await this.handlers.onFillError?.(session, error, fill);
      }
    }
  }

  private recordRecentError(
    orderId: string,
    error: unknown,
    ts?: string | null,
  ): void {
    const entries = [...(this.recentErrors.get(orderId) || [])];

    entries.push({
      ts: ts || new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    });

    this.recentErrors.set(orderId, entries.slice(-10));
  }

  private generateRunId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
