import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from 'src/common/entities/user-orders.entity';
import { MarketMakingPaymentState } from 'src/common/entities/payment-state.entity';
import { MarketMakingOrderIntent } from 'src/common/entities/market-making-order-intent.entity';
import {
  MarketMakingStates,
  SimplyGrowStates,
} from 'src/common/types/orders/states';
import { MarketMakingHistory } from 'src/common/entities/market-making-order.entity';
import { ArbitrageHistory } from 'src/common/entities/arbitrage-order.entity';
import { GrowdataRepository } from 'src/modules/data/grow-data/grow-data.repository';
import { encodeMarketMakingCreateMemo } from 'src/common/helpers/mixin/memo';

@Injectable()
export class UserOrdersService {
  private readonly logger = new CustomLogger(UserOrdersService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingRepository: Repository<MarketMakingOrder>,
    @InjectRepository(MarketMakingPaymentState)
    private readonly paymentStateRepository: Repository<MarketMakingPaymentState>,
    @InjectRepository(MarketMakingOrderIntent)
    private readonly marketMakingOrderIntentRepository: Repository<MarketMakingOrderIntent>,
    @InjectRepository(SimplyGrowOrder)
    private readonly simplyGrowRepository: Repository<SimplyGrowOrder>,
    @InjectRepository(MarketMakingHistory)
    private readonly marketMakingHistoryRepository: Repository<MarketMakingHistory>,
    @InjectRepository(ArbitrageHistory)
    private readonly arbitrageHistoryRepository: Repository<ArbitrageHistory>,
    @InjectQueue('market-making') private readonly marketMakingQueue: Queue,
    private readonly growdataRepository: GrowdataRepository,
  ) {}

  async findAllStrategyByUser(userId: string) {
    try {
      const market_makings = await this.marketMakingRepository.findBy({
        userId,
      });
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
      return await this.marketMakingRepository.findBy({ userId });
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

  async createMarketMakingPaymentState(paymentState: MarketMakingPaymentState): Promise<MarketMakingPaymentState> {
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

  async findMarketMakingPaymentStateByState(state: string): Promise<MarketMakingPaymentState[]> {
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
    marketMakingPairId: string;
    userId?: string;
  }) {
    const { marketMakingPairId, userId } = params;
    if (!marketMakingPairId) {
      throw new BadRequestException('marketMakingPairId is required');
    }

    const pair = await this.growdataRepository.findMarketMakingPairById(
      marketMakingPairId,
    );
    if (!pair || !pair.enable) {
      throw new NotFoundException('Market making pair not found');
    }

    const orderId = randomUUID();
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
      userId: userId || null,
      marketMakingPairId,
      state: 'pending',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt,
    });

    await this.marketMakingOrderIntentRepository.save(intent);

    return { orderId, memo, expiresAt };
  }

  // Methods moved from StrategyService
  async getUserOrders(userId: string): Promise<MarketMakingHistory[]> {
    return await this.marketMakingHistoryRepository.find({
      where: { userId },
      order: { executedAt: 'DESC' },
    });
  }

  async getUserArbitrageHistorys(userId: string): Promise<ArbitrageHistory[]> {
    return await this.arbitrageHistoryRepository.find({
      where: { userId },
      order: { executedAt: 'DESC' },
    });
  }

  // Timeout worker
  @Cron('*/60 * * * * *') // 60s
  async clearTimeoutOrders() {
    // Read all MarketMakingPaymentState
    const created = await this.findMarketMakingPaymentStateByState('created');
    // Check if created time over timeout 10m
    created.forEach((item) => {
      // check if timeout, refund if timeout, update state to timeout
      if (item.createdAt) {
        // Logic was empty in original file, keeping it empty or TODO
      }
    });
  }

  // Get all created order to run in strategy
  @Cron('*/60 * * * * *') // 60s
  async updateExecutionBasedOnOrders() {
    const enabled = this.configService.get<string>('strategy.run');
    if (enabled === 'false') {
      return;
    }

    // Get orders states that are created
    const activeMM = await this.marketMakingRepository.findBy({
      state: 'created',
    });

    if (activeMM) {
      activeMM.forEach(async (mm) => {
        await this.marketMakingQueue.add('start_mm', {
          userId: mm.userId,
          orderId: mm.orderId,
        });
      });
    }

    const pausedMM = await this.marketMakingRepository.findBy({
      state: 'paused',
    });

    if (pausedMM) {
      pausedMM.forEach(async (mm) => {
        await this.marketMakingQueue.add('stop_mm', {
          userId: mm.userId,
          orderId: mm.orderId,
        });
      });
    }
  }

  async stopMarketMaking(userId: string, orderId: string) {
    await this.marketMakingQueue.add('stop_mm', {
      userId,
      orderId,
    });
  }
}
