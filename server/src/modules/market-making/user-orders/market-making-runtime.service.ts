import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { Repository } from 'typeorm';

import { StrategyRuntimeDispatcherService } from '../strategy/execution/strategy-runtime-dispatcher.service';
import { StrategyService } from '../strategy/strategy.service';

@Injectable()
export class MarketMakingRuntimeService {
  constructor(
    private readonly strategyRuntimeDispatcher: StrategyRuntimeDispatcherService,
    private readonly strategyService: StrategyService,
    @InjectRepository(StrategyDefinition)
    private readonly strategyDefinitionRepository: Repository<StrategyDefinition>,
  ) {}

  async startOrder(order: MarketMakingOrder): Promise<void> {
    if (!order.strategySnapshot?.resolvedConfig) {
      throw new Error(`Order ${order.orderId} has no strategySnapshot.`);
    }

    const { controllerType, resolvedConfig } = order.strategySnapshot;
    const strategyType =
      this.strategyRuntimeDispatcher.toStrategyType(controllerType);

    await this.strategyRuntimeDispatcher.startByStrategyType(
      strategyType,
      resolvedConfig as Record<string, unknown>,
    );

    if (order.strategyDefinitionId) {
      await this.strategyService.linkDefinitionToStrategyInstance(
        order.userId,
        order.orderId,
        strategyType,
        order.strategyDefinitionId,
        strategyType === 'pureMarketMaking' ? order.orderId : undefined,
      );
    }
  }

  async stopOrder(
    order: MarketMakingOrder | undefined,
    fallbackUserId = 'system',
  ): Promise<void> {
    const strategyType = await this.resolveStrategyType(order);

    await this.strategyRuntimeDispatcher.stopByStrategyType(
      strategyType,
      order?.userId || fallbackUserId,
      order?.orderId || '',
    );
  }

  private async resolveStrategyType(
    order: MarketMakingOrder | undefined,
  ): Promise<ReturnType<StrategyRuntimeDispatcherService['toStrategyType']>> {
    if (order?.strategySnapshot?.controllerType) {
      return this.strategyRuntimeDispatcher.toStrategyType(
        order.strategySnapshot.controllerType,
      );
    }

    if (order?.strategyDefinitionId) {
      const definition = await this.strategyDefinitionRepository.findOne({
        where: { id: order.strategyDefinitionId },
      });

      if (definition?.controllerType || definition?.executorType) {
        return this.strategyRuntimeDispatcher.toStrategyType(
          definition.controllerType || definition.executorType,
        );
      }
    }

    return this.strategyRuntimeDispatcher.toStrategyType('pureMarketMaking');
  }
}
