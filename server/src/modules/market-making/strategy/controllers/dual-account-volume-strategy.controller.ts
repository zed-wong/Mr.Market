import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { TrackedOrderShutdownService } from '../../trackers/tracked-order-shutdown.service';
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
import { StrategySessionRegistryService } from '../runtime/strategy-session-registry.service';
import { sanitizeVolumeCadenceMs } from './volume-controller.helpers';

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
    private readonly trackedOrderShutdownService?: TrackedOrderShutdownService,
    @Optional()
    private readonly dualAccountPlannerService?: DualAccountPlannerService,
    @Optional()
    private readonly strategyMarketDataProviderService?: StrategyMarketDataProviderService,
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
    return await this.buildDualAccountVolumeSessionActions(
      ctx.session,
      ctx.ts,
      ctx.stopStrategyForUser,
    );
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
    stopStrategyForUser: StrategyTickContext['stopStrategyForUser'],
  ): Promise<ExecutorAction[]> {
    return await this.buildDualAccountSessionActions(
      session,
      ts,
      'classic',
      stopStrategyForUser,
    );
  }

  async buildDualAccountBestCapacityVolumeSessionActions(
    session: StrategyRuntimeSession,
    ts: string,
    stopStrategyForUser: StrategyTickContext['stopStrategyForUser'],
  ): Promise<ExecutorAction[]> {
    return await this.buildDualAccountSessionActions(
      session,
      ts,
      'best_capacity',
      stopStrategyForUser,
    );
  }

  async onDualAccountVolumeActionsPublished(
    session: StrategyRuntimeSession,
    actions: ExecutorAction[],
  ): Promise<void> {
    if (actions.length === 0) {
      return;
    }

    const activeBeforePersist = this.getActiveSession(session.strategyKey);

    if (!this.isSameActiveSession(activeBeforePersist, session)) {
      this.logger.warn(
        `Skipping stale dual-account volume tick before persist for ${session.strategyKey}: active session changed`,
      );

      return;
    }

    const params = activeBeforePersist.params as DualAccountVolumeStrategyParams;
    const persistedStrategy = await this.getStrategyInstanceRepository().findOne({
      where: { strategyKey: session.strategyKey },
    });
    const persistedParams = persistedStrategy?.parameters as
      | Partial<DualAccountVolumeStrategyParams>
      | undefined;
    const mergedParams = dualAccountConfig.mergeDualAccountConfigIntoRuntime(
      params,
      persistedParams,
    );
    const nextParams = this.getDualAccountPlanner().buildPublishedParams(
      mergedParams,
      actions,
      this.strategyMarketDataProviderService?.hasTrackedOrderBook(
        mergedParams.exchangeName,
        mergedParams.symbol,
      ) || false,
    );

    await this.persistStrategyParams(session.strategyKey, nextParams);

    const currentSession = this.getActiveSession(session.strategyKey);

    if (this.isSameActiveSession(currentSession, session)) {
      currentSession.params = nextParams;
      currentSession.cadenceMs =
        dualAccountConfig.resolveNextDualAccountCadenceMs(nextParams);
      this.setActiveSession(session.strategyKey, currentSession);

      return;
    }

    this.logger.warn(
      `Skipping stale dual-account volume tick write-back for ${session.strategyKey}: active session changed`,
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
    const result = this.getDualAccountPlanner().finalizeSettledCycle(params);

    if (!params.activeCycle || result.params === params) {
      return params;
    }

    if (result.underHedged) {
      const makerFilledQty = new BigNumber(params.activeCycle.makerFilledQty || 0);
      const takerFilledQty = new BigNumber(params.activeCycle.takerFilledQty || 0);

      this.logger.warn(
        `Dual-account cycle settled under-hedged for ${
          session.strategyKey
        }: cycle=${
          params.activeCycle.cycleId
        } makerFilledQty=${makerFilledQty.toFixed()} takerFilledQty=${takerFilledQty.toFixed()}`,
      );
    }

    await this.persistStrategyParams(session.strategyKey, result.params);

    return result.params;
  }

  private async buildDualAccountSessionActions(
    session: StrategyRuntimeSession,
    ts: string,
    selectionModel: 'classic' | 'best_capacity',
    stopStrategyForUser: StrategyTickContext['stopStrategyForUser'],
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
    const activeTrackedOrders = this.getTrackedOrderShutdown().getCancelableTrackedOrders(
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
      const repairAction = await this.getDualAccountPlanner().maybeBuildDualAccountRebalanceAction(
        session.strategyKey,
        latestParams,
        'buy',
        new BigNumber(0),
        new BigNumber(0),
        new BigNumber(0),
        await this.getDualAccountPlanner().resolveFeeBufferRate(
          latestParams.exchangeName,
          latestParams.symbol,
        ),
        Number(latestParams.publishedCycles || 0),
        ts,
      );

      return repairAction ? [repairAction] : [];
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

      await stopStrategyForUser(
        session.userId,
        session.clientId,
        session.strategyType,
      );

      return [];
    }

    if (targetQuoteVolume > 0 && tradedQuoteVolume >= targetQuoteVolume) {
      const activeBeforeStop = this.getActiveSession(session.strategyKey);

      if (!this.isSameActiveSession(activeBeforeStop, session)) {
        this.logger.warn(
          `Skipping stale dual-account target-volume stop for ${session.strategyKey}: active session changed`,
        );

        return [];
      }

      await stopStrategyForUser(
        session.userId,
        session.clientId,
        session.strategyType,
      );

      return [];
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
    return this.getStrategySessionRegistry().isSameActiveSession(active, expected);
  }

  private async persistStrategyParams(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
  ): Promise<void> {
    await this.getStrategyInstanceRepository().update(
      { strategyKey },
      {
        parameters: params as Record<string, any>,
        updatedAt: getRFC3339Timestamp(),
      },
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

  private getTrackedOrderShutdown(): TrackedOrderShutdownService {
    if (!this.trackedOrderShutdownService) {
      throw new Error('TrackedOrderShutdownService is not available');
    }

    return this.trackedOrderShutdownService;
  }

  private getDualAccountPlanner(): DualAccountPlannerService {
    if (!this.dualAccountPlannerService) {
      throw new Error('DualAccountPlannerService is not available');
    }

    return this.dualAccountPlannerService;
  }
}
