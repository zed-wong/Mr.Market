import { Injectable, Optional } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { OrderBookIngestionService } from '../../trackers/order-book-ingestion.service';
import { PureMarketMakingStrategyDto } from '../config/strategy.dto';
import {
  StrategyRuntimeSession,
  StrategyType,
} from '../config/strategy-controller.types';
import {
  ConnectorHealthStatus,
  PooledExecutorTarget,
  VolumeStrategyParams,
} from '../config/strategy-params.types';
import { TimeIndicatorStrategyDto } from '../config/timeIndicator.dto';
import * as dualAccountConfig from '../dual-account/dual-account-config';
import {
  ExchangePairExecutorSession,
  ExchangePairFill,
} from '../execution/exchange-pair-executor';
import { ExecutorRegistry } from '../execution/executor-registry';
import { StrategyWatcherManagerService } from './strategy-watcher-manager.service';

export interface StrategySessionRegistryCallbacks {
  runSession: (
    session: ExchangePairExecutorSession,
    ts: string,
  ) => Promise<void>;
  handleSessionFill: (
    session: StrategyRuntimeSession,
    fill: ExchangePairFill,
  ) => Promise<void>;
  logSessionTickError: (
    strategyKey: string,
    ts: string,
    error: unknown,
  ) => void;
  activateStrategyFromPersistence: (
    strategy: StrategyInstance,
    nextRunAtMs: number,
  ) => Promise<void>;
}

@Injectable()
export class StrategySessionRegistryService {
  private readonly logger = new CustomLogger(
    StrategySessionRegistryService.name,
  );
  readonly sessions = new Map<string, StrategyRuntimeSession>();
  readonly pendingActivationStrategies = new Map<string, StrategyInstance>();
  private readonly connectorHealthByExchange = new Map<
    string,
    ConnectorHealthStatus
  >();

  constructor(
    private readonly exchangeInitService: ExchangeInitService,
    @Optional()
    private readonly executorRegistry?: ExecutorRegistry,
    @Optional()
    private readonly strategyWatcherManagerService?: StrategyWatcherManagerService,
    @Optional()
    private readonly orderBookIngestionService?: OrderBookIngestionService,
  ) {}

  getConnectorHealthStatus(exchange: string): ConnectorHealthStatus {
    return this.connectorHealthByExchange.get(exchange) || 'CONNECTED';
  }

  setConnectorHealthStatus(
    exchange: string,
    status: ConnectorHealthStatus,
  ): void {
    const normalizedExchange = this.readString(exchange);

    if (!normalizedExchange) {
      return;
    }

    const previousStatus =
      this.connectorHealthByExchange.get(normalizedExchange);

    if (previousStatus === status) {
      return;
    }

    this.connectorHealthByExchange.set(normalizedExchange, status);
    this.logger.log(
      `Connector health ${normalizedExchange}: ${
        previousStatus || 'CONNECTED'
      } -> ${status}`,
    );
  }

  clear(): void {
    this.sessions.clear();
    this.pendingActivationStrategies.clear();
  }

  async upsertSession(
    strategyKey: string,
    strategyType: StrategyType,
    userId: string,
    clientId: string,
    cadenceMs: number,
    params: StrategyRuntimeSession['params'],
    callbacks: StrategySessionRegistryCallbacks,
    marketMakingOrderId?: string,
    nextRunAtMs = Date.now(),
    runId = this.generateRunId(),
  ): Promise<StrategyRuntimeSession> {
    const existingSession = this.sessions.get(strategyKey);

    if (existingSession) {
      await this.detachSessionFromExecutor(existingSession);
    }

    const pooledTarget = this.resolvePooledExecutorTarget(
      strategyType,
      params,
      clientId,
      marketMakingOrderId,
    );

    if (this.executorRegistry && pooledTarget) {
      const accountLabel = this.resolveAccountLabel(strategyType, params);
      const executor = this.executorRegistry.getOrCreateExecutor(
        pooledTarget.exchange,
        pooledTarget.pair,
        {
          onTick: callbacks.runSession,
          onFill: callbacks.handleSessionFill,
          onTickError: async (session, error, ts) => {
            callbacks.logSessionTickError(session.strategyKey, ts, error);
          },
          onFillError: async (session, error, fill) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const errorTrace = error instanceof Error ? error.stack : undefined;

            this.logger.error(
              `onFill handler failed for strategyKey=${
                session.strategyKey
              } exchange=${pooledTarget.exchange} pair=${
                pooledTarget.pair
              } clientOrderId=${fill.clientOrderId || ''}: ${errorMessage}`,
              errorTrace,
            );

            if (
              errorMessage.includes('insufficient locked balance') ||
              errorMessage.includes('insufficient available balance')
            ) {
              this.logger.error(
                `CRITICAL: Fill ledger error for strategyKey=${session.strategyKey} exchangeOrderId=${fill.exchangeOrderId}: ${errorMessage}`,
              );
            }
          },
        },
      );
      const pooledSession = await executor.addOrder(
        pooledTarget.orderId,
        userId,
        {
          strategyKey,
          strategyType,
          clientId,
          cadenceMs,
          accountLabel,
          params,
          marketMakingOrderId,
          nextRunAtMs,
          runId,
        },
      );

      this.strategyWatcherManagerService?.startPrivateWatchers(
        strategyType,
        pooledTarget.exchange,
        pooledTarget.pair,
        params,
      );
      this.strategyWatcherManagerService?.startBalanceWatchers(
        strategyType,
        pooledTarget.exchange,
        params,
      );
      this.logger.log(
        `Order book ingestion available=${Boolean(
          this.orderBookIngestionService,
        )} for ${pooledTarget.exchange} ${pooledTarget.pair}`,
      );
      this.orderBookIngestionService?.ensureSubscribed(
        pooledTarget.exchange,
        pooledTarget.pair,
      );

      this.sessions.set(strategyKey, pooledSession);

      return pooledSession;
    }

    throw new Error(
      `Cannot create session for strategyKey=${strategyKey}: executorRegistry not available or pooledTarget unresolved`,
    );
  }

  async restoreOrQueueStrategy(
    strategy: StrategyInstance,
    nextRunAtMs: number,
    callbacks: StrategySessionRegistryCallbacks,
  ): Promise<void> {
    if (!this.canActivateStrategyImmediately(strategy)) {
      this.pendingActivationStrategies.set(strategy.strategyKey, strategy);
      this.logger.log(
        `Queued pending activation for ${strategy.strategyKey}: exchange not ready yet`,
      );

      return;
    }

    await callbacks.activateStrategyFromPersistence(strategy, nextRunAtMs);
  }

  canActivateStrategyImmediately(strategy: StrategyInstance): boolean {
    const strategyType = strategy.strategyType as StrategyType;
    const params = strategy.parameters as StrategyRuntimeSession['params'];
    const target = this.resolvePooledExecutorTarget(
      strategyType,
      params,
      strategy.clientId,
      strategy.marketMakingOrderId ||
        (strategy.strategyType === 'pureMarketMaking'
          ? strategy.clientId
          : undefined),
    );

    if (!target) {
      return true;
    }

    return this.resolveRequiredAccountLabels(strategyType, params).every(
      (accountLabel) =>
        this.exchangeInitService.isReady(target.exchange, accountLabel),
    );
  }

  async activatePendingStrategiesForExchange(
    exchangeName: string,
    accountLabel: string,
    callbacks: StrategySessionRegistryCallbacks,
  ): Promise<void> {
    const pendingStrategies = [...this.pendingActivationStrategies.values()];

    for (const strategy of pendingStrategies) {
      const strategyType = strategy.strategyType as StrategyType;
      const params = strategy.parameters as StrategyRuntimeSession['params'];
      const target = this.resolvePooledExecutorTarget(
        strategyType,
        params,
        strategy.clientId,
        strategy.marketMakingOrderId ||
          (strategy.strategyType === 'pureMarketMaking'
            ? strategy.clientId
            : undefined),
      );

      if (!target || target.exchange !== exchangeName) {
        continue;
      }

      const requiredAccountLabels = this.resolveRequiredAccountLabels(
        strategyType,
        params,
      );

      if (!requiredAccountLabels.includes(accountLabel)) {
        continue;
      }

      if (
        !requiredAccountLabels.every((label) =>
          this.exchangeInitService.isReady(exchangeName, label),
        )
      ) {
        continue;
      }

      this.pendingActivationStrategies.delete(strategy.strategyKey);

      try {
        await callbacks.activateStrategyFromPersistence(strategy, Date.now());
        this.logger.log(
          `Activated pending strategy ${strategy.strategyKey} after ${exchangeName}:${accountLabel} became ready`,
        );
      } catch (error) {
        this.pendingActivationStrategies.set(strategy.strategyKey, strategy);
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        this.logger.warn(
          `Pending activation failed for ${strategy.strategyKey} on ${exchangeName}:${accountLabel}: ${errorMessage}`,
        );
      }
    }
  }

  async removeSession(
    strategyKey: string,
    session = this.sessions.get(strategyKey),
  ): Promise<void> {
    if (session) {
      await this.detachSessionFromExecutor(session);
    }

    this.sessions.delete(strategyKey);
  }

  isStrategyRuntimeEligible(strategy: StrategyInstance): Promise<boolean> {
    return Promise.resolve(this.canActivateStrategyImmediately(strategy));
  }

  isSameActiveSession(
    active: StrategyRuntimeSession | undefined,
    expected: StrategyRuntimeSession,
  ): active is StrategyRuntimeSession {
    return (
      !!active &&
      active.userId === expected.userId &&
      active.clientId === expected.clientId &&
      active.strategyType === expected.strategyType &&
      active.runId === expected.runId
    );
  }

  async detachSessionFromExecutor(
    session: StrategyRuntimeSession,
  ): Promise<void> {
    if (!this.executorRegistry) {
      return;
    }

    const pooledTarget = this.resolvePooledExecutorTarget(
      session.strategyType,
      session.params,
      session.clientId,
      session.marketMakingOrderId,
    );

    if (!pooledTarget) {
      return;
    }

    const executor = this.executorRegistry.getExecutor(
      pooledTarget.exchange,
      pooledTarget.pair,
    );

    if (!executor) {
      return;
    }

    await executor.removeOrder(pooledTarget.orderId);
    this.executorRegistry.removeExecutorIfEmpty(
      pooledTarget.exchange,
      pooledTarget.pair,
    );

    this.strategyWatcherManagerService?.stopPrivateWatchers(
      session.strategyType,
      pooledTarget.exchange,
      pooledTarget.pair,
      session.params,
    );
    this.strategyWatcherManagerService?.stopBalanceWatchers(
      session.strategyType,
      pooledTarget.exchange,
      session.params,
    );
    this.orderBookIngestionService?.releaseSubscription(
      pooledTarget.exchange,
      pooledTarget.pair,
    );
  }

  resolvePooledExecutorTarget(
    strategyType: StrategyType,
    params: StrategyRuntimeSession['params'],
    clientId: string,
    marketMakingOrderId?: string,
  ): PooledExecutorTarget | null {
    if (strategyType === 'pureMarketMaking') {
      const exchange = String(
        (params as unknown as PureMarketMakingStrategyDto).exchangeName || '',
      ).trim();
      const pair = String(
        (params as unknown as PureMarketMakingStrategyDto).pair || '',
      ).trim();
      const orderId = String(marketMakingOrderId || clientId || '').trim();

      if (exchange && pair && orderId) {
        return { exchange, pair, orderId };
      }

      return null;
    }

    if (
      strategyType === 'volume' ||
      strategyType === 'dualAccountVolume' ||
      strategyType === 'dualAccountBestCapacityVolume' ||
      strategyType === 'efficientDualAccountVolume'
    ) {
      const exchange = String(
        (params as unknown as VolumeStrategyParams).exchangeName || '',
      ).trim();
      const pair = dualAccountConfig.resolveRuntimePair(
        params as unknown as VolumeStrategyParams,
      );
      const orderId = String(clientId || '').trim();

      if (exchange && pair && orderId) {
        return { exchange, pair, orderId };
      }

      return null;
    }

    if (strategyType === 'timeIndicator') {
      const exchange = String(
        (params as unknown as TimeIndicatorStrategyDto).exchangeName || '',
      ).trim();
      const pair = String(
        (params as unknown as TimeIndicatorStrategyDto).symbol || '',
      ).trim();
      const orderId = String(clientId || '').trim();

      if (exchange && pair && orderId) {
        return { exchange, pair, orderId };
      }
    }

    return null;
  }

  resolveAccountLabel(
    strategyType: StrategyType,
    params: StrategyRuntimeSession['params'],
  ): string | undefined {
    return this.strategyWatcherManagerService?.resolveAccountLabel(
      strategyType,
      params,
    );
  }

  resolveRequiredAccountLabels(
    strategyType: StrategyType,
    params: StrategyRuntimeSession['params'],
  ): string[] {
    return (
      this.strategyWatcherManagerService?.resolveRequiredAccountLabels(
        strategyType,
        params,
      ) || ['default']
    );
  }

  private generateRunId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
