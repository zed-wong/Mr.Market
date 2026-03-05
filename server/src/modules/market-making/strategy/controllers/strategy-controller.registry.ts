import { Injectable } from '@nestjs/common';

import {
  StrategyController,
  StrategyType,
} from '../config/strategy-controller.types';

@Injectable()
export class StrategyControllerRegistry {
  private readonly controllersByType = new Map<
    StrategyType,
    StrategyController
  >();

  constructor(controllers: StrategyController[]) {
    for (const controller of controllers) {
      if (this.controllersByType.has(controller.strategyType)) {
        throw new Error(
          `Duplicate strategy controller registered for type "${controller.strategyType}"`,
        );
      }
      this.controllersByType.set(controller.strategyType, controller);
    }
  }

  getController(strategyType: string): StrategyController | undefined {
    return this.controllersByType.get(strategyType as StrategyType);
  }

  listControllerTypes(): StrategyType[] {
    return [...this.controllersByType.keys()];
  }
}
