import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bull';
import { randomUUID } from 'crypto';
import { MarketMakingOrderIntent } from 'src/common/entities/market-making/market-making-order-intent.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { MarketMakingPaymentState } from 'src/common/entities/orders/payment-state.entity';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from 'src/common/entities/orders/user-orders.entity';
import { encodeMarketMakingCreateMemo } from 'src/common/helpers/mixin/memo';
import type {
  MarketMakingStates,
  SimplyGrowStates,
} from 'src/common/types/orders/states';
import { GrowdataRepository } from 'src/modules/data/grow-data/grow-data.repository';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';
import { validate as isUuid } from 'uuid';

import { normalizeControllerType } from '../strategy/config/strategy-controller-aliases';
import { StrategyConfigResolverService } from '../strategy/dex/strategy-config-resolver.service';

const RESERVED_CONFIG_OVERRIDE_FIELDS = new Set([
  'userId',
  'clientId',
  'marketMakingOrderId',
  'pair',
  'exchangeName',
]);

const UNSAFE_CONFIG_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

@Injectable()
export class UserOrdersService {
  private readonly logger = new CustomLogger(UserOrdersService.name);

  constructor(
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingRepository: Repository<MarketMakingOrder>,
    @InjectRepository(MarketMakingPaymentState)
    private readonly paymentStateRepository: Repository<MarketMakingPaymentState>,
    @InjectRepository(MarketMakingOrderIntent)
    private readonly marketMakingOrderIntentRepository: Repository<MarketMakingOrderIntent>,
    @InjectRepository(StrategyDefinition)
    private readonly strategyDefinitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(SimplyGrowOrder)
    private readonly simplyGrowRepository: Repository<SimplyGrowOrder>,
    @InjectRepository(StrategyExecutionHistory)
    private readonly strategyExecutionHistoryRepository: Repository<StrategyExecutionHistory>,
    @InjectQueue('market-making') private readonly marketMakingQueue: Queue,
    private readonly growdataRepository: GrowdataRepository,
    private readonly strategyConfigResolver: StrategyConfigResolverService,
  ) {}

  async findAllStrategyByUser(userId: string) {
    try {
      const market_makings = await this.marketMakingRepository
        .createQueryBuilder('order')
        .where('order.userId = :userId', { userId })
        .andWhere('(order.source IS NULL OR order.source != :source)', {
          source: 'admin_direct',
        })
        .getMany();
      const simply_grows = await this.simplyGrowRepository.findBy({ userId });

      return {
        market_making: market_makings,
        simply_grow: simply_grows,
        total: market_makings.length + simply_grows.length,
      };
    } catch (error) {
      this.logger.error('Error finding all strategy by user', error);

      return { market_making: [], simply_grow: [], total: 0 };
    }
  }

  async createSimplyGrow(
    simplyGrowOrder: SimplyGrowOrder,
  ): Promise<SimplyGrowOrder> {
    try {
      return await this.simplyGrowRepository.save(simplyGrowOrder);
    } catch (error) {
      this.logger.error('Error creating simply grow order', error);
      throw error;
    }
  }

  async findSimplyGrowByOrderId(
    orderId: string,
  ): Promise<SimplyGrowOrder | undefined> {
    return await this.simplyGrowRepository.findOneBy({ orderId });
  }

  async findOwnedSimplyGrowByOrderId(
    userId: string,
    orderId: string,
  ): Promise<SimplyGrowOrder> {
    const order = await this.simplyGrowRepository.findOneBy({
      orderId,
      userId,
    });

    if (!order) {
      throw new NotFoundException('Simply grow order not found');
    }

    return order;
  }

  async findSimplyGrowByUserId(userId: string): Promise<SimplyGrowOrder[]> {
    return await this.simplyGrowRepository.findBy({ userId });
  }

  async updateSimplyGrowState(
    orderId: string,
    newState: SimplyGrowStates,
  ): Promise<void> {
    try {
      await this.simplyGrowRepository.update({ orderId }, { state: newState });
    } catch (error) {
      this.logger.error('Error updating simply grow state', error);
      throw error;
    }
  }

  async createMarketMaking(
    marketMakingOrder: MarketMakingOrder,
  ): Promise<MarketMakingOrder> {
    try {
      return await this.marketMakingRepository.save(marketMakingOrder);
    } catch (error) {
      this.logger.error('Error creating market making order', error.message);
      throw error;
    }
  }

  async findMarketMakingByOrderId(
    orderId: string,
  ): Promise<MarketMakingOrder | undefined> {
    try {
      return await this.marketMakingRepository.findOneBy({ orderId });
    } catch (error) {
      this.logger.error(
        'Error finding market making order by orderId',
        error.message,
      );
      throw error;
    }
  }

  async findMarketMakingByUserId(userId: string): Promise<MarketMakingOrder[]> {
    try {
      return await this.marketMakingRepository
        .createQueryBuilder('order')
        .where('order.userId = :userId', { userId })
        .andWhere('(order.source IS NULL OR order.source != :source)', {
          source: 'admin_direct',
        })
        .getMany();
    } catch (error) {
      this.logger.error(
        'Error finding market making orders by userId',
        error.message,
      );
      throw error;
    }
  }

  async updateMarketMakingOrderState(
    orderId: string,
    newState: MarketMakingStates,
  ): Promise<void> {
    try {
      await this.marketMakingRepository.update(
        { orderId },
        { state: newState },
      );
      this.logger.log(
        `Market making order ${orderId} updated successfully to state ${newState}`,
      );
    } catch (error) {
      this.logger.error(
        `Error updating market making order state for orderId ${orderId}`,
        error.message,
      );
      throw error;
    }
  }

  async createMarketMakingPaymentState(
    paymentState: MarketMakingPaymentState,
  ): Promise<MarketMakingPaymentState> {
    return await this.paymentStateRepository.save(paymentState);
  }

  async findMarketMakingPaymentStateById(orderId: string) {
    try {
      const result = await this.paymentStateRepository.findOneBy({ orderId });

      if (!result) {
        return { code: 404, message: 'Not found', data: {} };
      } else {
        return { code: 200, message: 'Found', data: result };
      }
    } catch (error) {
      this.logger.error('Error finding state by id', error.message);

      return { code: 404, message: 'Not found', data: {} };
    }
  }

  async findMarketMakingPaymentStateByIdRaw(orderId: string) {
    return await this.paymentStateRepository.findOneBy({ orderId });
  }

  async findOwnedMarketMakingPaymentStateById(userId: string, orderId: string) {
    const result = await this.paymentStateRepository.findOneBy({
      orderId,
      userId,
    });

    if (!result) {
      throw new NotFoundException('Payment state not found');
    }

    return { code: 200, message: 'Found', data: result };
  }

  async findMarketMakingPaymentStateByState(
    state: string,
  ): Promise<MarketMakingPaymentState[]> {
    return await this.paymentStateRepository.findBy({ state });
  }

  async updateMarketMakingPaymentStateById(
    orderId: string,
    newMarketMakingPaymentState: Partial<MarketMakingPaymentState>,
  ) {
    const updateResult = await this.paymentStateRepository.update(
      { orderId },
      newMarketMakingPaymentState,
    );

    if (updateResult.affected === 0) {
      return null;
    }

    return updateResult;
  }

  async createMarketMakingOrderIntent(params: {
    userId: string;
    marketMakingPairId: string;
    strategyDefinitionId: string;
    configOverrides?: Record<string, unknown>;
  }) {
    const {
      userId,
      marketMakingPairId,
      strategyDefinitionId,
      configOverrides,
    } = params;

    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    if (!isUuid(userId)) {
      throw new BadRequestException('userId must be a valid UUID');
    }
    if (!marketMakingPairId) {
      throw new BadRequestException('marketMakingPairId is required');
    }
    if (!strategyDefinitionId) {
      throw new BadRequestException('strategyDefinitionId is required');
    }
    if (
      configOverrides !== undefined &&
      (configOverrides === null ||
        Array.isArray(configOverrides) ||
        typeof configOverrides !== 'object')
    ) {
      throw new BadRequestException('configOverrides must be an object');
    }
    this.assertConfigOverridesSafe(configOverrides);

    const pair = await this.growdataRepository.findMarketMakingPairById(
      marketMakingPairId,
    );

    if (!pair || !pair.enable) {
      throw new NotFoundException('Market making pair not found');
    }

    const definition = await this.strategyDefinitionRepository.findOne({
      where: { id: strategyDefinitionId, enabled: true },
    });

    if (!definition) {
      throw new NotFoundException('Strategy definition not found or disabled');
    }
    if (!this.isPureMarketMakingDefinition(definition)) {
      throw new BadRequestException(
        'strategyDefinitionId must reference a pure market making definition',
      );
    }

    const orderId = randomUUID();

    await this.strategyConfigResolver.resolveForOrderSnapshot(
      strategyDefinitionId,
      this.buildOrderSnapshotOverrides({
        orderId,
        userId,
        pair: pair.symbol,
        exchangeName: pair.exchange_id,
        configOverrides,
      }),
    );
    const memo = encodeMarketMakingCreateMemo({
      version: 1,
      tradingType: 'Market Making',
      action: 'create',
      marketMakingPairId,
      orderId,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const intent = this.marketMakingOrderIntentRepository.create({
      orderId,
      userId,
      marketMakingPairId,
      strategyDefinitionId,
      configOverrides: configOverrides ?? null,
      state: 'pending',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt,
    });

    await this.marketMakingOrderIntentRepository.save(intent);

    return { orderId, memo, expiresAt };
  }

  async findPublicMarketMakingByOrderId(
    orderId: string,
  ): Promise<MarketMakingOrder | undefined> {
    return await this.marketMakingRepository
      .createQueryBuilder('order')
      .where('order.orderId = :orderId', { orderId })
      .andWhere('(order.source IS NULL OR order.source != :source)', {
        source: 'admin_direct',
      })
      .getOne();
  }

  async findOwnedMarketMakingByOrderId(
    userId: string,
    orderId: string,
  ): Promise<MarketMakingOrder> {
    const order = await this.marketMakingRepository
      .createQueryBuilder('order')
      .where('order.orderId = :orderId', { orderId })
      .andWhere('order.userId = :userId', { userId })
      .andWhere('(order.source IS NULL OR order.source != :source)', {
        source: 'admin_direct',
      })
      .getOne();

    if (!order) {
      throw new NotFoundException('Market making order not found');
    }

    return order;
  }

  async listEnabledMarketMakingStrategies() {
    const definitions = await this.strategyDefinitionRepository.find({
      where: { enabled: true },
      order: { updatedAt: 'DESC' },
    });

    return definitions
      .filter((definition) => this.isPureMarketMakingDefinition(definition))
      .map((definition) => ({
        id: definition.id,
        key: definition.key,
        name: definition.name,
        description: definition.description,
        controllerType: definition.controllerType || definition.executorType,
        defaultConfig: definition.defaultConfig || {},
        configSchema: definition.configSchema || {},
      }));
  }

  private isPureMarketMakingDefinition(
    definition: Partial<StrategyDefinition> | null | undefined,
  ): boolean {
    const controllerType = normalizeControllerType(
      definition?.controllerType || definition?.executorType,
    );

    return controllerType === 'pureMarketMaking';
  }

  private buildOrderSnapshotOverrides(params: {
    orderId: string;
    userId: string;
    pair: string;
    exchangeName: string;
    configOverrides?: Record<string, unknown>;
  }): Record<string, unknown> {
    return {
      ...(params.configOverrides || {}),
      userId: params.userId,
      clientId: params.orderId,
      marketMakingOrderId: params.orderId,
      pair: params.pair.replaceAll('-ERC20', ''),
      exchangeName: params.exchangeName,
    };
  }

  private assertConfigOverridesSafe(
    configOverrides?: Record<string, unknown>,
  ): void {
    if (!configOverrides) {
      return;
    }

    for (const field of RESERVED_CONFIG_OVERRIDE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(configOverrides, field)) {
        throw new BadRequestException(
          `configOverrides cannot override system field: ${field}`,
        );
      }
    }

    this.assertNoUnsafeConfigKeys(configOverrides, 'configOverrides');
  }

  private assertNoUnsafeConfigKeys(value: unknown, path: string): void {
    if (value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        this.assertNoUnsafeConfigKeys(item, `${path}[${index}]`),
      );

      return;
    }

    if (typeof value !== 'object') {
      return;
    }

    if (!this.isPlainObject(value)) {
      throw new BadRequestException(
        `${path} must contain only plain JSON objects`,
      );
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (UNSAFE_CONFIG_KEYS.has(key)) {
        throw new BadRequestException(
          `configOverrides contains unsafe key: ${path}.${key}`,
        );
      }

      this.assertNoUnsafeConfigKeys(nestedValue, `${path}.${key}`);
    }
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
  }

  // Methods moved from StrategyService
  async getUserOrders(userId: string): Promise<StrategyExecutionHistory[]> {
    return await this.strategyExecutionHistoryRepository.find({
      where: {
        userId,
        strategyType: 'market-making',
      },
      order: { executedAt: 'DESC' },
    });
  }

  async getUserArbitrageHistorys(
    userId: string,
  ): Promise<StrategyExecutionHistory[]> {
    return await this.strategyExecutionHistoryRepository.find({
      where: {
        userId,
        strategyType: 'arbitrage',
      },
      order: { executedAt: 'DESC' },
    });
  }

  async stopMarketMaking(userId: string, orderId: string) {
    await this.marketMakingQueue.add('stop_mm', {
      userId,
      orderId,
    });
  }
}
