import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { ExecutorAction } from '../config/executor-action.types';
import type { StrategyRuntimeSession } from '../config/strategy-controller.types';
import type { DualAccountVolumeStrategyParams } from '../config/strategy-params.types';
import { StrategyMarketDataProviderService } from '../data/strategy-market-data-provider.service';
import * as dualAccountConfig from '../dual-account/dual-account-config';
import { DualAccountPlannerService } from '../dual-account/dual-account-planner.service';
import { StrategySessionRegistryService } from './strategy-session-registry.service';

@Injectable()
export class DualAccountRuntimeStateService {
  private readonly logger = new CustomLogger(DualAccountRuntimeStateService.name);

  constructor(
    @Optional()
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository?: Repository<StrategyInstance>,
    @Optional()
    private readonly strategySessionRegistryService?: StrategySessionRegistryService,
    @Optional()
    private readonly dualAccountPlannerService?: DualAccountPlannerService,
    @Optional()
    private readonly strategyMarketDataProviderService?: StrategyMarketDataProviderService,
  ) {}

  async onActionsPublished(
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

    const params =
      activeBeforePersist.params as DualAccountVolumeStrategyParams;
    const persistedStrategy = await this.getStrategyInstanceRepository().findOne(
      {
        where: { strategyKey: session.strategyKey },
      },
    );
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

  async finalizeSettledCycle(
    session: StrategyRuntimeSession,
    params: DualAccountVolumeStrategyParams,
  ): Promise<DualAccountVolumeStrategyParams> {
    const result = this.getDualAccountPlanner().finalizeSettledCycle(params);

    if (!params.activeCycle || result.params === params) {
      return params;
    }

    if (result.underHedged) {
      const makerFilledQty = new BigNumber(
        params.activeCycle.makerFilledQty || 0,
      );
      const takerFilledQty = new BigNumber(
        params.activeCycle.takerFilledQty || 0,
      );

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

  private getDualAccountPlanner(): DualAccountPlannerService {
    if (!this.dualAccountPlannerService) {
      throw new Error('DualAccountPlannerService is not available');
    }

    return this.dualAccountPlannerService;
  }
}
