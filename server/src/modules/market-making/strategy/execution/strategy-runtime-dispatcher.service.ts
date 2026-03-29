import { BadRequestException, Injectable } from '@nestjs/common';

import {
  ArbitrageStrategyDto,
  DexAdapterId,
  PureMarketMakingStrategyDto,
} from '../config/strategy.dto';
import type { StrategyType } from '../config/strategy-controller.types';
import { normalizeControllerType } from '../config/strategy-controller-aliases';
import {
  normalizeExecutionCategory,
  toLegacyExecutionVenue,
} from '../config/strategy-execution-category';
import { TimeIndicatorStrategyDto } from '../config/timeIndicator.dto';
import { StrategyService } from '../strategy.service';

type RuntimeStrategyConfig = Record<string, unknown>;

@Injectable()
export class StrategyRuntimeDispatcherService {
  constructor(private readonly strategyService: StrategyService) {}

  private resolveVolumeExecutionVenue(
    config: RuntimeStrategyConfig,
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
    config: RuntimeStrategyConfig,
  ): string {
    return normalizeExecutionCategory(
      this.readString(config.executionCategory) ||
        this.readString(config.executionVenue),
    );
  }

  toStrategyType(controllerType: string): StrategyType {
    const normalizedControllerType = normalizeControllerType(controllerType);

    if (normalizedControllerType === 'arbitrage') {
      return 'arbitrage';
    }
    if (normalizedControllerType === 'pureMarketMaking') {
      return 'pureMarketMaking';
    }
    if (normalizedControllerType === 'volume') {
      return 'volume';
    }
    if (normalizedControllerType === 'timeIndicator') {
      return 'timeIndicator';
    }

    throw new BadRequestException(
      `Unsupported controllerType ${controllerType}. Allowed: arbitrage, pureMarketMaking, volume, timeIndicator`,
    );
  }

  mapStrategyTypeToController(strategyType: string): StrategyType {
    if (strategyType === 'marketMaking') {
      return 'pureMarketMaking';
    }

    return this.toStrategyType(strategyType);
  }

  async startByStrategyType(
    strategyType: StrategyType,
    config: RuntimeStrategyConfig,
  ): Promise<void> {
    if (strategyType === 'arbitrage') {
      await this.strategyService.startArbitrageStrategyForUser(
        config as unknown as ArbitrageStrategyDto,
        Number(config.checkIntervalSeconds || 10),
        Number(config.maxOpenOrders || 1),
      );

      return;
    }

    if (strategyType === 'pureMarketMaking') {
      await this.strategyService.executePureMarketMakingStrategy(
        config as unknown as PureMarketMakingStrategyDto,
      );

      return;
    }

    if (strategyType === 'timeIndicator') {
      await this.strategyService.executeTimeIndicatorStrategy(
        config as unknown as TimeIndicatorStrategyDto,
      );

      return;
    }

    const executionVenue = this.resolveVolumeExecutionVenue(config);
    const executionCategory = this.resolveVolumeExecutionCategory(config);

    await this.strategyService.executeVolumeStrategy(
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

  async stopByStrategyType(
    strategyType: StrategyType,
    userId: string,
    clientId: string,
  ): Promise<void> {
    await this.strategyService.stopStrategyForUser(
      userId,
      clientId,
      strategyType,
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
