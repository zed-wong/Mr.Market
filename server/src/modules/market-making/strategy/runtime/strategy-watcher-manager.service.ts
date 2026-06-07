import { Injectable, Optional } from '@nestjs/common';

import { BalanceStateRefreshService } from '../../balance-state/balance-state-refresh.service';
import { UserStreamIngestionService } from '../../trackers/user-stream-ingestion.service';
import { PureMarketMakingStrategyDto } from '../config/strategy.dto';
import {
  StrategyRuntimeSession,
  StrategyType,
} from '../config/strategy-controller.types';
import { DualAccountVolumeStrategyParams } from '../config/strategy-params.types';

@Injectable()
export class StrategyWatcherManagerService {
  constructor(
    @Optional()
    private readonly userStreamIngestionService?: UserStreamIngestionService,
    @Optional()
    private readonly balanceStateRefreshService?: BalanceStateRefreshService,
  ) {}

  startPrivateWatchers(
    strategyType: StrategyType,
    exchange: string,
    pair: string,
    params: StrategyRuntimeSession['params'],
  ): void {
    if (!this.usesPrivateOrderStreams(strategyType)) {
      return;
    }

    for (const accountLabel of this.resolveRequiredAccountLabels(
      strategyType,
      params,
    )) {
      this.userStreamIngestionService?.startOrderWatcher({
        exchange,
        accountLabel: accountLabel || 'default',
        symbol: pair,
      });
      this.userStreamIngestionService?.startTradeWatcher({
        exchange,
        accountLabel: accountLabel || 'default',
        symbol: pair,
      });
    }
  }

  stopPrivateWatchers(
    strategyType: StrategyType,
    exchange: string,
    pair: string,
    params: StrategyRuntimeSession['params'],
  ): void {
    if (!this.usesPrivateOrderStreams(strategyType)) {
      return;
    }

    for (const accountLabel of this.resolveRequiredAccountLabels(
      strategyType,
      params,
    )) {
      this.userStreamIngestionService?.stopOrderWatcher({
        exchange,
        accountLabel: accountLabel || 'default',
        symbol: pair,
      });
      this.userStreamIngestionService?.stopTradeWatcher({
        exchange,
        accountLabel: accountLabel || 'default',
        symbol: pair,
      });
    }
  }

  startBalanceWatchers(
    strategyType: StrategyType,
    exchange: string,
    params: StrategyRuntimeSession['params'],
  ): void {
    if (!this.usesBalanceStreams(strategyType)) {
      return;
    }

    for (const accountLabel of this.resolveRequiredAccountLabels(
      strategyType,
      params,
    )) {
      this.userStreamIngestionService?.startBalanceWatcher({
        exchange,
        accountLabel: accountLabel || 'default',
      });
      this.balanceStateRefreshService?.registerAccount(
        exchange,
        accountLabel || 'default',
      );
    }
  }

  stopBalanceWatchers(
    strategyType: StrategyType,
    exchange: string,
    params: StrategyRuntimeSession['params'],
  ): void {
    if (!this.usesBalanceStreams(strategyType)) {
      return;
    }

    for (const accountLabel of this.resolveRequiredAccountLabels(
      strategyType,
      params,
    )) {
      this.userStreamIngestionService?.stopBalanceWatcher({
        exchange,
        accountLabel: accountLabel || 'default',
      });
      this.balanceStateRefreshService?.releaseAccount(
        exchange,
        accountLabel || 'default',
      );
    }
  }

  resolveAccountLabel(
    strategyType: StrategyType,
    params: StrategyRuntimeSession['params'],
  ): string | undefined {
    if (
      strategyType === 'dualAccountVolume' ||
      strategyType === 'dualAccountBestCapacityVolume' ||
      strategyType === 'efficientDualAccountVolume'
    ) {
      return undefined;
    }

    if (strategyType !== 'pureMarketMaking') {
      return undefined;
    }

    const accountLabel = String(
      (params as unknown as PureMarketMakingStrategyDto).accountLabel ||
        'default',
    ).trim();

    return accountLabel || 'default';
  }

  resolveRequiredAccountLabels(
    strategyType: StrategyType,
    params: StrategyRuntimeSession['params'],
  ): string[] {
    if (
      strategyType === 'dualAccountVolume' ||
      strategyType === 'dualAccountBestCapacityVolume' ||
      strategyType === 'efficientDualAccountVolume'
    ) {
      const dualParams = params as unknown as DualAccountVolumeStrategyParams;

      return [dualParams.makerAccountLabel, dualParams.takerAccountLabel]
        .map((label) => String(label || '').trim() || 'default')
        .filter((label, index, labels) => labels.indexOf(label) === index);
    }

    const accountLabel = this.resolveAccountLabel(strategyType, params);

    return accountLabel ? [accountLabel] : ['default'];
  }

  private usesPrivateOrderStreams(strategyType: StrategyType): boolean {
    return (
      strategyType === 'pureMarketMaking' ||
      strategyType === 'dualAccountVolume' ||
      strategyType === 'dualAccountBestCapacityVolume' ||
      strategyType === 'efficientDualAccountVolume'
    );
  }

  private usesBalanceStreams(strategyType: StrategyType): boolean {
    return (
      strategyType === 'pureMarketMaking' ||
      strategyType === 'timeIndicator' ||
      strategyType === 'dualAccountVolume' ||
      strategyType === 'dualAccountBestCapacityVolume' ||
      strategyType === 'efficientDualAccountVolume'
    );
  }
}
