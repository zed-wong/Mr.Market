import { BadRequestException, Injectable } from '@nestjs/common';

import {
  ArbitrageStrategyDto,
  PureMarketMakingStrategyDto,
} from './strategy.dto';
import { StrategyService } from './strategy.service';
import { StrategyType } from './strategy-controller.types';
import {
  normalizeExecutionCategory,
  toLegacyExecutionVenue,
} from './strategy-execution-category';

@Injectable()
export class StrategyRuntimeDispatcherService {
  constructor(private readonly strategyService: StrategyService) {}

  private resolveVolumeExecutionVenue(
    config: Record<string, any>,
  ): 'cex' | 'dex' {
    if (config.executionCategory !== undefined) {
      const normalized = normalizeExecutionCategory(config.executionCategory);

      return toLegacyExecutionVenue(normalized);
    }

    return config.executionVenue === 'dex' ? 'dex' : 'cex';
  }

  private resolveVolumeExecutionCategory(config: Record<string, any>): string {
    return normalizeExecutionCategory(
      config.executionCategory || config.executionVenue,
    );
  }

  toStrategyType(controllerType: string): StrategyType {
    if (controllerType === 'arbitrage') {
      return 'arbitrage';
    }
    if (controllerType === 'pureMarketMaking') {
      return 'pureMarketMaking';
    }
    if (controllerType === 'volume') {
      return 'volume';
    }

    throw new BadRequestException(
      `Unsupported controllerType ${controllerType}. Allowed: arbitrage, pureMarketMaking, volume`,
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
    config: Record<string, any>,
  ): Promise<void> {
    if (strategyType === 'arbitrage') {
      await this.strategyService.startArbitrageStrategyForUser(
        config as ArbitrageStrategyDto,
        Number(config.checkIntervalSeconds || 10),
        Number(config.maxOpenOrders || 1),
      );

      return;
    }

    if (strategyType === 'pureMarketMaking') {
      await this.strategyService.executePureMarketMakingStrategy(
        config as PureMarketMakingStrategyDto,
      );

      return;
    }

    const executionVenue = this.resolveVolumeExecutionVenue(config);
    const executionCategory = this.resolveVolumeExecutionCategory(config);

    await this.strategyService.executeVolumeStrategy(
      config.exchangeName,
      config.symbol,
      Number(config.incrementPercentage ?? config.baseIncrementPercentage ?? 0),
      Number(config.intervalTime ?? config.baseIntervalTime ?? 10),
      Number(config.tradeAmount ?? config.baseTradeAmount ?? 0),
      Number(config.numTrades || 1),
      config.userId,
      config.clientId,
      Number(config.pricePushRate || 0),
      config.postOnlySide,
      executionVenue,
      config.dexId,
      config.chainId,
      config.tokenIn,
      config.tokenOut,
      config.feeTier,
      config.slippageBps,
      config.recipient,
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
}
