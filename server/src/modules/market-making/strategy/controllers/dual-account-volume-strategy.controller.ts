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
import { ExecuteDualAccountVolumeStrategyDto } from '../config/strategy.dto';
import type {
  StrategyController,
  StrategyControllerFacade,
  StrategyRuntimeSession,
  StrategyTickContext,
} from '../config/strategy-controller.types';
import type { DualAccountVolumeStrategyParams } from '../config/strategy-params.types';
import { StrategyMarketDataProviderService } from '../data/strategy-market-data-provider.service';
import * as dualAccountConfig from '../dual-account/dual-account-config';
import { DualAccountPlannerService } from '../dual-account/dual-account-planner.service';
import { RuntimeObservationService } from '../observation/runtime-observation.service';
import { DualAccountRuntimeStateService } from '../runtime/dual-account-runtime-state.service';
import { StrategySessionRegistryService } from '../runtime/strategy-session-registry.service';
import { sanitizeVolumeCadenceMs } from './volume-controller.helpers';

const DUAL_ACCOUNT_SOFT_FAILURE_THRESHOLD = 3;
const DUAL_ACCOUNT_UNSAFE_OUTCOME_THRESHOLD = 5;
const DUAL_ACCOUNT_SOFT_FAILURE_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class DualAccountVolumeStrategyController implements StrategyController {
  readonly strategyType = 'dualAccountVolume' as const;
  private readonly logger = new CustomLogger(
    DualAccountVolumeStrategyController.name,
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

  getCadenceMs(parameters: Record<string, unknown>): number {
    return sanitizeVolumeCadenceMs(parameters?.baseIntervalTime);
  }

  async start(
    config: Record<string, unknown>,
    service: StrategyControllerFacade,
  ): Promise<void> {
    await service.executeDualAccountVolumeStrategy(
      config as unknown as ExecuteDualAccountVolumeStrategyDto,
    );
  }

  async decideActions(ctx: StrategyTickContext): Promise<ExecutorAction[]> {
    return await this.buildDualAccountVolumeSessionActions(ctx.session, ctx.ts);
  }

  async onActionsPublished(
    ctx: StrategyTickContext,
    actions: ExecutorAction[],
  ): Promise<void> {
    await this.onDualAccountVolumeActionsPublished(ctx.session, actions);
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyControllerFacade,
  ): Promise<void> {
    await service.executeDualAccountVolumeStrategy({
      ...(strategyInstance.parameters as ExecuteDualAccountVolumeStrategyDto),
      userId: strategyInstance.userId,
      clientId: strategyInstance.clientId,
    });
  }

  async buildDualAccountVolumeSessionActions(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<ExecutorAction[]> {
    return await this.buildDualAccountSessionActions(
      session,
      ts,
      'classic',
    );
  }

  async buildDualAccountBestCapacityVolumeSessionActions(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<ExecutorAction[]> {
    return await this.buildDualAccountSessionActions(
      session,
      ts,
      'best_capacity',
    );
  }

  async buildOptimalDualAccountVolumeSessionActions(
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
      latestParams = await this.finalizeSettledDualAccountCycle(
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
        'optimal',
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
        `Optimal dual-account volume ${session.strategyKey}: publishing cancel intent for timed-out maker order ${oldestOrder.orderId} age=${orderAge}ms`,
      );

      return [
        this.buildCancelTrackedOrderAction(session, oldestOrder, ts, {
          reason: 'maker_timeout',
          orderAgeMs: orderAge,
        }),
      ];
    }

    return await this.getDualAccountPlanner().buildOptimalDualAccountVolumeActions(
      session.strategyKey,
      latestParams,
      ts,
    );
  }

  async onDualAccountVolumeActionsPublished(
    session: StrategyRuntimeSession,
    actions: ExecutorAction[],
  ): Promise<void> {
    await this.getDualAccountRuntimeStateService().onActionsPublished(
      session,
      actions,
    );
  }

  async buildDualAccountVolumeActions(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    ts: string,
  ): Promise<ExecutorAction[]> {
    return await this.getDualAccountPlanner().buildDualAccountVolumeActions(
      strategyKey,
      params,
      ts,
    );
  }

  async buildDualAccountBestCapacityVolumeActions(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    ts: string,
  ): Promise<ExecutorAction[]> {
    return await this.getDualAccountPlanner().buildDualAccountBestCapacityVolumeActions(
      strategyKey,
      params,
      ts,
    );
  }

  async finalizeSettledDualAccountCycle(
    session: StrategyRuntimeSession,
    params: DualAccountVolumeStrategyParams,
  ): Promise<DualAccountVolumeStrategyParams> {
    return await this.getDualAccountRuntimeStateService().finalizeSettledCycle(
      session,
      params,
    );
  }

  private async buildDualAccountSessionActions(
    session: StrategyRuntimeSession,
    ts: string,
    selectionModel: 'classic' | 'best_capacity',
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
      latestParams = await this.finalizeSettledDualAccountCycle(
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

    const completedCycles = Number(latestParams.completedCycles || 0);
    const tradedQuoteVolume = Number(
      latestParams.tradedQuoteVolume || activeSession?.tradedQuoteVolume || 0,
    );
    const targetQuoteVolume = Number(latestParams.targetQuoteVolume || 0);

    if (latestParams.repairRequired) {
      const repairActions = await this.buildRepairOrResumeActions(
        session,
        latestParams,
        selectionModel,
        ts,
      );

      return repairActions;
    }

    const maxCompletedCycles = Number(latestParams.numTrades || 0);

    if (maxCompletedCycles > 0 && completedCycles >= maxCompletedCycles) {
      const activeBeforeStop = this.getActiveSession(session.strategyKey);

      if (!this.isSameActiveSession(activeBeforeStop, session)) {
        this.logger.warn(
          `Skipping stale dual-account volume stop for ${session.strategyKey}: active session changed`,
        );

        return [];
      }

      return [
        this.buildStopControllerAction(session, ts, 'completed_cycles_reached'),
      ];
    }

    if (targetQuoteVolume > 0 && tradedQuoteVolume >= targetQuoteVolume) {
      const activeBeforeStop = this.getActiveSession(session.strategyKey);

      if (!this.isSameActiveSession(activeBeforeStop, session)) {
        this.logger.warn(
          `Skipping stale dual-account target-volume stop for ${session.strategyKey}: active session changed`,
        );

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
      return [];
    }

    return selectionModel === 'best_capacity'
      ? await this.buildDualAccountBestCapacityVolumeActions(
          session.strategyKey,
          latestParams,
          ts,
        )
      : await this.buildDualAccountVolumeActions(
          session.strategyKey,
          latestParams,
          ts,
        );
  }

  private async buildRepairRebalanceAction(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    preferredSide: 'buy' | 'sell',
    ts: string,
  ): Promise<ExecutorAction | null> {
    if (!this.strategyMarketDataProviderService) {
      this.logger.warn(
        `Skipping dual-account repair for ${strategyKey}: market data provider is not available`,
      );

      return null;
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

      return null;
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

      return null;
    }

    return await this.getDualAccountPlanner().maybeBuildDualAccountRebalanceAction(
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
  }

  private async buildRepairOrResumeActions(
    session: StrategyRuntimeSession,
    params: DualAccountVolumeStrategyParams,
    selectionModel: 'classic' | 'best_capacity' | 'optimal',
    ts: string,
  ): Promise<ExecutorAction[]> {
    const resumedParams: DualAccountVolumeStrategyParams = {
      ...params,
      repairRequired: false,
      repairReason: undefined,
    };
    const resumedActions = await this.buildSelectionModelActions(
      session.strategyKey,
      resumedParams,
      selectionModel,
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

    const repairAction = await this.buildRepairRebalanceAction(
      session.strategyKey,
      params,
      'buy',
      ts,
    );

    return repairAction ? [repairAction] : [];
  }

  private async buildSelectionModelActions(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    selectionModel: 'classic' | 'best_capacity' | 'optimal',
    ts: string,
  ): Promise<ExecutorAction[]> {
    if (selectionModel === 'optimal') {
      return await this.getDualAccountPlanner().buildOptimalDualAccountVolumeActions(
        strategyKey,
        params,
        ts,
      );
    }

    if (selectionModel === 'best_capacity') {
      return await this.buildDualAccountBestCapacityVolumeActions(
        strategyKey,
        params,
        ts,
      );
    }

    return await this.buildDualAccountVolumeActions(strategyKey, params, ts);
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
      metadata: { reason },
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
