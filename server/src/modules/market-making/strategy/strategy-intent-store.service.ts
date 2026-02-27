import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Not, Repository } from 'typeorm';

import {
  StrategyIntentStatus,
  StrategyOrderIntent,
} from './strategy-intent.types';

@Injectable()
export class StrategyIntentStoreService {
  constructor(
    @InjectRepository(StrategyOrderIntentEntity)
    private readonly strategyOrderIntentRepository: Repository<StrategyOrderIntentEntity>,
  ) {}

  async upsertIntent(intent: StrategyOrderIntent): Promise<void> {
    const existing = await this.strategyOrderIntentRepository.findOneBy({
      intentId: intent.intentId,
    });

    const payload: StrategyOrderIntentEntity = {
      intentId: intent.intentId,
      strategyInstanceId: intent.strategyInstanceId,
      strategyKey: intent.strategyKey,
      userId: intent.userId,
      clientId: intent.clientId,
      type: intent.type,
      exchange: intent.exchange,
      pair: intent.pair,
      side: intent.side,
      price: intent.price,
      qty: intent.qty,
      mixinOrderId: intent.mixinOrderId,
      status: intent.status,
      errorReason: undefined,
      createdAt: existing?.createdAt || intent.createdAt,
      updatedAt: getRFC3339Timestamp(),
    };

    await this.strategyOrderIntentRepository.save(
      existing ? { ...existing, ...payload } : payload,
    );
  }

  async updateIntentStatus(
    intentId: string,
    status: StrategyIntentStatus,
    errorReason?: string,
  ): Promise<void> {
    const existing = await this.strategyOrderIntentRepository.findOneBy({
      intentId,
    });

    if (!existing) {
      return;
    }

    existing.status = status;
    existing.errorReason = errorReason;
    existing.updatedAt = getRFC3339Timestamp();
    await this.strategyOrderIntentRepository.save(existing);
  }

  async attachMixinOrderId(
    intentId: string,
    mixinOrderId: string,
  ): Promise<void> {
    const existing = await this.strategyOrderIntentRepository.findOneBy({
      intentId,
    });

    if (!existing) {
      return;
    }

    existing.mixinOrderId = mixinOrderId;
    existing.updatedAt = getRFC3339Timestamp();
    await this.strategyOrderIntentRepository.save(existing);
  }

  async listAll(): Promise<StrategyOrderIntentEntity[]> {
    return await this.strategyOrderIntentRepository.find();
  }

  async listStrategyKeysWithNewIntents(limit: number): Promise<string[]> {
    if (limit <= 0) {
      return [];
    }

    const rows = await this.strategyOrderIntentRepository
      .createQueryBuilder('intent')
      .select('intent.strategyKey', 'strategyKey')
      .where('intent.status = :status', { status: 'NEW' })
      .groupBy('intent.strategyKey')
      .orderBy('MIN(intent.createdAt)', 'ASC')
      .addOrderBy('intent.strategyKey', 'ASC')
      .limit(limit)
      .getRawMany<{ strategyKey: string }>();

    return rows.map((row) => row.strategyKey);
  }

  async getHeadIntent(
    strategyKey: string,
  ): Promise<StrategyOrderIntentEntity | null> {
    return await this.strategyOrderIntentRepository.findOne({
      where: {
        strategyKey,
        status: Not('DONE'),
      },
      order: {
        createdAt: 'ASC',
        intentId: 'ASC',
      },
    });
  }
}
