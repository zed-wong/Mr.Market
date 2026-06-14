import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import {
  ExchangeOrderTrackerService,
  TrackedOrder,
} from '../../trackers/exchange-order-tracker.service';
import { ExecutorAction } from '../config/executor-action.types';
import type { StrategyRuntimeSession } from '../config/strategy-controller.types';
import type { DualAccountVolumeStrategyParams } from '../config/strategy-params.types';
import { RuntimeObservationService } from '../observation/runtime-observation.service';
import { DualAccountRuntimeStateService } from '../runtime/dual-account-runtime-state.service';
import { StrategySessionRegistryService } from '../runtime/strategy-session-registry.service';
import { StrategyMarketDataProviderService } from '../data/strategy-market-data-provider.service';
import * as dualAccountConfig from './dual-account-config';
import {
  DualAccountPlannerService,
  type DualAccountReadinessBlockingReason,
} from './dual-account-planner.service';

const DUAL_ACCOUNT_SOFT_FAILURE_THRESHOLD = 3;
const DUAL_ACCOUNT_UNSAFE_OUTCOME_THRESHOLD = 5;
const DUAL_ACCOUNT_SOFT_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const DUAL_ACCOUNT_NO_PROGRESS_STOP_THRESHOLD = 3;

type EfficientNoProgressReasonCode =
  | DualAccountReadinessBlockingReason['code']
  | 'empty_decision_after_ready'
  | 'empty_decision_without_reason';

type EfficientNoProgressReason = {
  code: EfficientNoProgressReasonCode;
  message: string;
};

@Injectable()
export class EfficientDualAccountRuntimeService {
  private readonly logger = new CustomLogger(
    EfficientDualAccountRuntimeService.name,
  );

  constructor(
    @Optional()
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository?: Repository<StrategyInstance>,
    @Optional()
    private readonly strategySessionRegistryService?: StrategySessionRegistryService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
    @Optional()
    private readonly dualAccountPlannerService?: DualAccountPlannerService,
    @Optional()
    private readonly strategyMarketDataProviderService?: StrategyMarketDataProviderService,
    @Optional()
    private readonly runtimeObservationService?: RuntimeObservationService,
    @Optional()
    private readonly dualAccountRuntimeStateService?: DualAccountRuntimeStateService,
  ) {}

  async buildEfficientDualAccountVolumeSessionActions(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<ExecutorAction[]> {
    const activeSession = this.getActiveSession(session.strategyKey);
    const persistedParams = (
      await this.getStrategyInstanceRepository().findOne({
        where: { strategyKey: session.strategyKey },
      })
    )?.parameters as Partial<DualAccountVolumeStrategyParams> | undefined;
    const runtimeParams =
      (activeSession?.params as DualAccountVolumeStrategyParams) ||
      (session.params as DualAccountVolumeStrategyParams);
    let latestParams = dualAccountConfig.mergeDualAccountConfigIntoRuntime(
      runtimeParams,
      persistedParams,
    );

    if (!latestParams.marketMakingOrderId && session.marketMakingOrderId) {
      latestParams = {
        ...latestParams,
        marketMakingOrderId: session.marketMakingOrderId,
      };
    }

    const activeTrackedOrders = this.getCancelableTrackedOrders(
      session.strategyKey,
    );

    if (activeTrackedOrders.length === 0) {
      latestParams = await this.finalizeSettledEfficientDualAccountCycle(
        session,
        latestParams,
      );
    }

    if (this.isSameActiveSession(activeSession, session) && activeSession) {
      activeSession.params = latestParams;
      activeSession.cadenceMs =
        dualAccountConfig.resolveNextDualAccountCadenceMs(latestParams);
      this.setActiveSession(session.strategyKey, activeSession);
    }

    const tradedQuoteVolume = Number(
      latestParams.tradedQuoteVolume || activeSession?.tradedQuoteVolume || 0,
    );
    const targetQuoteVolume = Number(latestParams.targetQuoteVolume || 0);

    if (latestParams.repairRequired) {
      const repairActions = await this.buildRepairOrResumeActions(
        session,
        latestParams,
        ts,
      );

      return repairActions;
    }

    if (targetQuoteVolume > 0 && tradedQuoteVolume >= targetQuoteVolume) {
      const activeBeforeStop = this.getActiveSession(session.strategyKey);

      if (!this.isSameActiveSession(activeBeforeStop, session)) {
        return [];
      }

      return [
        this.buildStopControllerAction(session, ts, 'target_volume_reached'),
      ];
    }

    const softFailureStopAction = this.buildDualAccountSoftFailureStopAction(
      session,
      ts,
    );

    if (softFailureStopAction) {
      return [softFailureStopAction];
    }

    if (activeTrackedOrders.length > 0) {
      const oldestOrder = activeTrackedOrders[0];
      const orderAge =
        Date.now() - new Date(oldestOrder.createdAt).getTime();

      if (orderAge < dualAccountConfig.OPTIMAL_MAKER_TIMEOUT_MS) {
        return [];
      }

      this.logger.warn(
        `Efficient dual-account volume ${session.strategyKey}: publishing cancel intent for timed-out maker order ${oldestOrder.orderId} age=${orderAge}ms`,
      );

      return [
        this.buildCancelTrackedOrderAction(session, oldestOrder, ts, {
          reason: 'maker_timeout',
          orderAgeMs: orderAge,
        }),
      ];
    }

    const actions = await this.buildEfficientDualAccountVolumeActions(
      session.strategyKey,
      latestParams,
      ts,
    );

    if (actions.length > 0) {
      return actions;
    }

    return await this.buildNoProgressActionOrWait(session, latestParams, ts);
  }

  async onEfficientDualAccountActionsPublished(
    session: StrategyRuntimeSession,
    actions: ExecutorAction[],
  ): Promise<void> {
    await this.getDualAccountRuntimeStateService().onActionsPublished(
      session,
      actions,
    );
  }

  async buildEfficientDualAccountVolumeActions(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    ts: string,
  ): Promise<ExecutorAction[]> {
    return await this.getDualAccountPlanner().buildEfficientDualAccountVolumeActions(
      strategyKey,
      params,
      ts,
    );
  }

  async finalizeSettledEfficientDualAccountCycle(
    session: StrategyRuntimeSession,
    params: DualAccountVolumeStrategyParams,
  ): Promise<DualAccountVolumeStrategyParams> {
    return await this.getDualAccountRuntimeStateService().finalizeSettledCycle(
      session,
      params,
    );
  }

  private async buildRepairRebalanceAction(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    preferredSide: 'buy' | 'sell',
    ts: string,
  ): Promise<{ attempted: boolean; action: ExecutorAction | null }> {
    if (!this.strategyMarketDataProviderService) {
      this.logger.warn(
        `Skipping dual-account repair for ${strategyKey}: market data provider is not available`,
      );

      return { attempted: false, action: null };
    }

    const bestBidAsk =
      this.strategyMarketDataProviderService.getTrackedBestBidAsk(
        params.exchangeName,
        params.symbol,
      );

    if (!bestBidAsk) {
      this.logger.warn(
        `Skipping dual-account repair for ${strategyKey}: tracked best bid/ask is unavailable`,
      );

      return { attempted: false, action: null };
    }

    const bestBid = new BigNumber(bestBidAsk.bestBid);
    const bestAsk = new BigNumber(bestBidAsk.bestAsk);
    const price = bestBid.plus(bestAsk).dividedBy(2);

    if (
      !bestBid.isFinite() ||
      !bestAsk.isFinite() ||
      !price.isFinite() ||
      bestBid.isLessThanOrEqualTo(0) ||
      bestAsk.isLessThanOrEqualTo(0) ||
      price.isLessThanOrEqualTo(0)
    ) {
      this.logger.warn(
        `Skipping dual-account repair for ${strategyKey}: invalid tracked best bid/ask bid=${bestBidAsk.bestBid} ask=${bestBidAsk.bestAsk}`,
      );

      return { attempted: false, action: null };
    }

    const action =
      await this.getDualAccountPlanner().maybeBuildDualAccountRebalanceAction(
        strategyKey,
        params,
        preferredSide,
        bestBid,
        bestAsk,
        price,
        await this.getDualAccountPlanner().resolveFeeBufferRate(
          params.exchangeName,
          params.symbol,
        ),
        Number(params.publishedCycles || 0),
        ts,
      );

    return { attempted: true, action };
  }

  private async buildRepairOrResumeActions(
    session: StrategyRuntimeSession,
    params: DualAccountVolumeStrategyParams,
    ts: string,
  ): Promise<ExecutorAction[]> {
    const resumedParams: DualAccountVolumeStrategyParams = {
      ...params,
      repairRequired: false,
      repairReason: undefined,
    };
    const resumedActions = await this.buildEfficientDualAccountVolumeActions(
      session.strategyKey,
      resumedParams,
      ts,
    );
    const hasTradeAction = resumedActions.some(
      (action) => !this.getDualAccountPlanner().isRebalanceAction(action),
    );

    if (hasTradeAction) {
      await this.persistStrategyParams(session.strategyKey, resumedParams);
      this.updateActiveSessionParams(session, resumedParams);
      this.logger.warn(
        `Cleared dual-account repair mode for ${session.strategyKey}: current balances can resume paired execution`,
      );

      return resumedActions;
    }

    const repairResult = await this.buildRepairRebalanceAction(
      session.strategyKey,
      params,
      'buy',
      ts,
    );

    if (repairResult.action) {
      return [repairResult.action];
    }

    if (!repairResult.attempted) {
      return [];
    }

    const repairNoProgressReason = await this.resolveNoProgressReason(params);

    if (!this.shouldStopRepairAsUnexecutable(repairNoProgressReason)) {
      return await this.buildNoProgressActionOrWait(
        session,
        params,
        ts,
        repairNoProgressReason,
      );
    }

    return [
      this.buildStopControllerAction(
        session,
        ts,
        'dual_account_repair_unexecutable',
      ),
    ];
  }

  private async buildNoProgressActionOrWait(
    session: StrategyRuntimeSession,
    params: DualAccountVolumeStrategyParams,
    ts: string,
    resolvedReason?: EfficientNoProgressReason,
  ): Promise<ExecutorAction[]> {
    const reason =
      resolvedReason || (await this.resolveNoProgressReason(params));

    if (this.shouldWaitWithoutCountingNoProgress(params, reason)) {
      return [];
    }

    const nextTickCount =
      params.lastNoProgressReason === reason.code
        ? Number(params.consecutiveNoProgressTicks || 0) + 1
        : 1;
    const nextParams: DualAccountVolumeStrategyParams = {
      ...params,
      consecutiveNoProgressTicks: nextTickCount,
      lastNoProgressReason: reason.code,
    };
    const activeSession = this.getActiveSession(session.strategyKey);

    if (activeSession && !this.isSameActiveSession(activeSession, session)) {
      return [];
    }

    await this.persistStrategyParams(session.strategyKey, nextParams);
    this.updateActiveSessionParams(session, nextParams);

    if (nextTickCount < DUAL_ACCOUNT_NO_PROGRESS_STOP_THRESHOLD) {
      this.logger.warn(
        `Efficient dual-account volume ${session.strategyKey}: no executable action reason=${reason.code} streak=${nextTickCount}/${DUAL_ACCOUNT_NO_PROGRESS_STOP_THRESHOLD} message=${reason.message}`,
      );

      return [];
    }

    return [
      this.buildStopControllerAction(
        session,
        ts,
        `dual_account_no_progress_${reason.code}`,
        {
          noProgressReason: reason.code,
          noProgressMessage: reason.message,
          noProgressTicks: nextTickCount,
        },
      ),
    ];
  }

  private async resolveNoProgressReason(
    params: DualAccountVolumeStrategyParams,
  ): Promise<EfficientNoProgressReason> {
    const readiness =
      await this.getDualAccountPlanner().evaluateEfficientDualAccountReadiness(
        params,
      );
    const [blockingReason] = readiness.blockingReasons;

    if (blockingReason) {
      return {
        code: blockingReason.code,
        message: blockingReason.message,
      };
    }

    if (readiness.canStart) {
      return {
        code: 'empty_decision_after_ready',
        message:
          'Planner returned no action even though readiness found an executable first action',
      };
    }

    return {
      code: 'empty_decision_without_reason',
      message: 'Planner returned no action without a readiness blocking reason',
    };
  }

  private shouldWaitWithoutCountingNoProgress(
    params: DualAccountVolumeStrategyParams,
    reason: EfficientNoProgressReason,
  ): boolean {
    return (
      !params.orderBookReady &&
      (reason.code === 'market_data_missing' ||
        reason.code === 'market_data_stale')
    );
  }

  private shouldStopRepairAsUnexecutable(
    reason: EfficientNoProgressReason,
  ): boolean {
    return (
      reason.code === 'below_exchange_minimums' ||
      reason.code === 'empty_decision_after_ready' ||
      reason.code === 'empty_decision_without_reason'
    );
  }

  private async persistStrategyParams(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
  ): Promise<void> {
    await this.getStrategyInstanceRepository().update(
      { strategyKey },
      {
        parameters: params as StrategyInstance['parameters'],
      },
    );
  }

  private updateActiveSessionParams(
    session: StrategyRuntimeSession,
    params: DualAccountVolumeStrategyParams,
  ): void {
    const activeSession = this.getActiveSession(session.strategyKey);

    if (!this.isSameActiveSession(activeSession, session)) {
      return;
    }

    activeSession.params = params;
    activeSession.cadenceMs =
      dualAccountConfig.resolveNextDualAccountCadenceMs(params);
    this.setActiveSession(session.strategyKey, activeSession);
  }

  private getActiveSession(
    strategyKey: string,
  ): StrategyRuntimeSession | undefined {
    return this.getStrategySessionRegistry().sessions.get(strategyKey);
  }

  private setActiveSession(
    strategyKey: string,
    session: StrategyRuntimeSession,
  ): void {
    this.getStrategySessionRegistry().sessions.set(strategyKey, session);
  }

  private isSameActiveSession(
    active: StrategyRuntimeSession | undefined,
    expected: StrategyRuntimeSession,
  ): active is StrategyRuntimeSession {
    return this.getStrategySessionRegistry().isSameActiveSession(
      active,
      expected,
    );
  }

  private getStrategyInstanceRepository(): Repository<StrategyInstance> {
    if (!this.strategyInstanceRepository) {
      throw new Error('StrategyInstance repository is not available');
    }

    return this.strategyInstanceRepository;
  }

  private getStrategySessionRegistry(): StrategySessionRegistryService {
    if (!this.strategySessionRegistryService) {
      throw new Error('StrategySessionRegistryService is not available');
    }

    return this.strategySessionRegistryService;
  }

  private getCancelableTrackedOrders(strategyKey: string): TrackedOrder[] {
    if (!this.exchangeOrderTrackerService) {
      throw new Error('ExchangeOrderTrackerService is not available');
    }

    const trackedOrders =
      this.exchangeOrderTrackerService.getTrackedOrders?.(strategyKey) ||
      this.exchangeOrderTrackerService.getOpenOrders(strategyKey) ||
      [];

    return trackedOrders.filter(
      (order) =>
        order?.exchangeOrderId &&
        !this.isTrackedOrderTerminal(String(order.status || '')),
    );
  }

  private buildCancelTrackedOrderAction(
    session: StrategyRuntimeSession,
    order: TrackedOrder,
    ts: string,
    metadata: Record<string, unknown>,
  ): ExecutorAction {
    return {
      type: 'CANCEL_ORDER',
      intentId: `${session.strategyKey}:${ts}:cancel-${metadata.reason}-${order.exchangeOrderId}`,
      runtimeInstanceKey: session.strategyKey,
      strategyKey: session.strategyKey,
      userId: session.userId,
      clientId: session.clientId,
      exchange: order.exchange,
      accountLabel: order.accountLabel,
      pair: order.pair,
      side: order.side,
      price: order.price,
      qty: order.qty,
      mixinOrderId: order.exchangeOrderId,
      slotKey: order.slotKey,
      metadata: {
        ...metadata,
        role: order.role,
        exchangeOrderId: order.exchangeOrderId,
        orderId: order.orderId,
      },
      createdAt: ts,
    };
  }

  private buildStopControllerAction(
    session: StrategyRuntimeSession,
    ts: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): ExecutorAction {
    return {
      type: 'STOP_CONTROLLER',
      intentId: `${session.strategyKey}:${ts}:stop-${reason}`,
      runtimeInstanceKey: session.strategyKey,
      strategyKey: session.strategyKey,
      userId: session.userId,
      clientId: session.clientId,
      exchange: '',
      pair: '',
      side: 'buy',
      price: '0',
      qty: '0',
      metadata: { reason, ...(metadata || {}) },
      createdAt: ts,
    };
  }

  private buildDualAccountSoftFailureStopAction(
    session: StrategyRuntimeSession,
    ts: string,
  ): ExecutorAction | null {
    if (!this.runtimeObservationService) {
      return null;
    }

    const health = this.runtimeObservationService.getDualAccountCycleHealth(
      session.strategyKey,
      DUAL_ACCOUNT_SOFT_FAILURE_WINDOW_MS,
    );

    if (health.unsafeOutcomeCount >= DUAL_ACCOUNT_UNSAFE_OUTCOME_THRESHOLD) {
      return this.buildStopControllerAction(
        session,
        ts,
        'dual_account_unsafe_cycle_outcome',
      );
    }

    if (health.softFailureCount < DUAL_ACCOUNT_SOFT_FAILURE_THRESHOLD) {
      return null;
    }

    return this.buildStopControllerAction(
      session,
      ts,
      'dual_account_soft_failure_threshold_exceeded',
    );
  }

  private isTrackedOrderTerminal(status: string): boolean {
    return ['filled', 'cancelled', 'failed'].includes(
      String(status || '').toLowerCase(),
    );
  }

  private getDualAccountPlanner(): DualAccountPlannerService {
    if (!this.dualAccountPlannerService) {
      throw new Error('DualAccountPlannerService is not available');
    }

    return this.dualAccountPlannerService;
  }

  private getDualAccountRuntimeStateService(): DualAccountRuntimeStateService {
    if (!this.dualAccountRuntimeStateService) {
      throw new Error('DualAccountRuntimeStateService is not available');
    }

    return this.dualAccountRuntimeStateService;
  }
}
