import { Injectable } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ExecutorAction } from '../config/executor-action.types';
import { DexAdapterId } from '../config/strategy.dto';
import type {
  StrategyController,
  StrategyRuntimeSession,
} from '../config/strategy-controller.types';
import {
  normalizeExecutionCategory,
  toLegacyExecutionVenue,
} from '../config/strategy-execution-category';
import { StrategyService } from '../strategy.service';
import {
  normalizeVolumeRerunConfig,
  sanitizeVolumeCadenceMs,
} from './volume-controller.helpers';

@Injectable()
export class VolumeStrategyController implements StrategyController {
  readonly strategyType = 'volume' as const;

  getCadenceMs(parameters: Record<string, unknown>): number {
    return sanitizeVolumeCadenceMs(
      parameters?.baseIntervalTime ?? parameters?.intervalTime,
    );
  }

  async decideActions(
    session: StrategyRuntimeSession,
    ts: string,
    service: StrategyService,
  ): Promise<ExecutorAction[]> {
    return await service.buildVolumeSessionActions(session, ts);
  }

  async onActionsPublished(
    session: StrategyRuntimeSession,
    actions: ExecutorAction[],
    service: StrategyService,
  ): Promise<void> {
    await service.onVolumeActionsPublished(session, actions);
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyService,
  ): Promise<void> {
    const config = normalizeVolumeRerunConfig(strategyInstance);

    await service.executeVolumeStrategy(
      config.exchangeName,
      config.symbol,
      config.baseIncrementPercentage,
      config.baseIntervalTime,
      config.baseTradeAmount,
      config.numTrades,
      config.userId,
      config.clientId,
      config.pricePushRate,
      config.postOnlySide,
      config.executionVenue as any,
      config.dexId as any,
      config.chainId,
      config.tokenIn,
      config.tokenOut,
      config.feeTier,
      config.slippageBps,
      config.recipient,
      config.executionCategory,
    );
  }

  async start(
    config: Record<string, unknown>,
    service: StrategyService,
  ): Promise<void> {
    const executionVenue = this.resolveVolumeExecutionVenue(config);
    const executionCategory = this.resolveVolumeExecutionCategory(config);

    await service.executeVolumeStrategy(
      this.readString(config.exchangeName),
      this.readString(config.symbol),
      this.readNumber(config.incrementPercentage) ??
        this.readNumber(config.baseIncrementPercentage) ??
        0,
      this.readNumber(config.intervalTime) ??
        this.readNumber(config.baseIntervalTime) ??
        10,
      this.readNumber(config.tradeAmount) ??
        this.readNumber(config.baseTradeAmount) ??
        0,
      this.readNumber(config.numTrades) ?? 1,
      this.readString(config.userId) || '',
      this.readString(config.clientId) || '',
      this.readNumber(config.pricePushRate) ?? 0,
      this.readSide(config.postOnlySide),
      executionVenue,
      this.readDexAdapterId(config.dexId),
      this.readNumber(config.chainId),
      this.readString(config.tokenIn),
      this.readString(config.tokenOut),
      this.readNumber(config.feeTier),
      this.readNumber(config.slippageBps),
      this.readString(config.recipient),
      executionCategory,
    );
  }

  private resolveVolumeExecutionVenue(
    config: Record<string, unknown>,
  ): 'cex' | 'dex' {
    if (config.executionCategory !== undefined) {
      const normalized = normalizeExecutionCategory(
        this.readString(config.executionCategory),
      );

      return toLegacyExecutionVenue(normalized);
    }

    return this.readString(config.executionVenue) === 'dex' ? 'dex' : 'cex';
  }

  private resolveVolumeExecutionCategory(
    config: Record<string, unknown>,
  ): string {
    return normalizeExecutionCategory(
      this.readString(config.executionCategory) ||
        this.readString(config.executionVenue),
    );
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private readNumber(value: unknown): number | undefined {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : undefined;

    return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
  }

  private readSide(value: unknown): 'buy' | 'sell' | undefined {
    return value === 'buy' || value === 'sell' ? value : undefined;
  }

  private readDexAdapterId(value: unknown): DexAdapterId | undefined {
    return value === 'uniswapV3' || value === 'pancakeV3' ? value : undefined;
  }
}
