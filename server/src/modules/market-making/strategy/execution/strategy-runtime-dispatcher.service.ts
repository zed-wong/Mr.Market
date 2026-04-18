import { BadRequestException, Injectable } from '@nestjs/common';

import type { StrategyType } from '../config/strategy-controller.types';
import { normalizeControllerType } from '../config/strategy-controller-aliases';
import { StrategyControllerRegistry } from '../controllers/strategy-controller.registry';
import { StrategyService } from '../strategy.service';

@Injectable()
export class StrategyRuntimeDispatcherService {
  constructor(
    private readonly strategyService: StrategyService,
    private readonly strategyControllerRegistry: StrategyControllerRegistry,
  ) {}

  toStrategyType(controllerType: string): StrategyType {
    const normalizedControllerType = normalizeControllerType(controllerType);

    if (
      this.strategyControllerRegistry.getController(
        normalizedControllerType as StrategyType,
      )
    ) {
      return normalizedControllerType as StrategyType;
    }

    if (normalizedControllerType === 'arbitrage') {
      return 'arbitrage';
    }
    if (normalizedControllerType === 'pureMarketMaking') {
      return 'pureMarketMaking';
    }
    if (normalizedControllerType === 'dualAccountVolume') {
      return 'dualAccountVolume';
    }
    if (normalizedControllerType === 'dualAccountBestCapacityVolume') {
      return 'dualAccountBestCapacityVolume';
    }
    if (normalizedControllerType === 'volume') {
      return 'volume';
    }
    if (normalizedControllerType === 'timeIndicator') {
      return 'timeIndicator';
    }

    const knownTypes =
      this.strategyControllerRegistry.listControllerTypes().join(', ');

    throw new BadRequestException(
      `Unsupported controllerType ${controllerType}. Known: ${knownTypes}`,
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
    config: Record<string, unknown>,
  ): Promise<void> {
    const controller = this.strategyControllerRegistry.getController(strategyType);

    if (controller?.start) {
      await controller.start(config, this.strategyService);

      return;
    }

    throw new BadRequestException(
      `No start handler registered for strategy type ${strategyType}`,
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