import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { In, Repository } from 'typeorm';

import {
  StrategyIntentStatus,
  StrategyOrderIntent,
} from '../config/strategy-intent.types';

export type StrategyIntentQueueState = {
  blockedByFailure: boolean;
  headIntentStatus: StrategyIntentStatus | null;
  failedHeadIntentId?: string;
  failedHeadUpdatedAt?: string;
  failedHeadErrorReason?: string;
};

const ACTIVE_OR_FAILED_INTENT_STATUSES: StrategyIntentStatus[] = [
  'NEW',
  'SENT',
  'ACKED',
  'FAILED',
];

const CANCELLABLE_INTENT_STATUSES: StrategyIntentStatus[] = [
  'NEW',
  'SENT',
  'ACKED',
];

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
      executionCategory: intent.executionCategory,
      metadata: intent.metadata,
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
        status: In(ACTIVE_OR_FAILED_INTENT_STATUSES),
      },
      order: {
        createdAt: 'ASC',
        intentId: 'ASC',
      },
    });
  }

  async getNextNewIntent(
    strategyKey: string,
  ): Promise<StrategyOrderIntentEntity | null> {
    return await this.strategyOrderIntentRepository.findOne({
      where: {
        strategyKey,
        status: 'NEW',
      },
      order: {
        createdAt: 'ASC',
        intentId: 'ASC',
      },
    });
  }

  async getQueueState(strategyKey: string): Promise<StrategyIntentQueueState> {
    const [headIntent, oldestNewIntent] = await Promise.all([
      this.getHeadIntent(strategyKey),
      this.getNextNewIntent(strategyKey),
    ]);

    const blockedByFailure =
      headIntent?.status === 'FAILED' &&
      Boolean(oldestNewIntent) &&
      oldestNewIntent?.intentId !== headIntent.intentId;

    if (!blockedByFailure || !headIntent) {
      return {
        blockedByFailure: false,
        headIntentStatus: (headIntent?.status as StrategyIntentStatus) || null,
      };
    }

    return {
      blockedByFailure: true,
      headIntentStatus: 'FAILED',
      failedHeadIntentId: headIntent.intentId,
      failedHeadUpdatedAt: headIntent.updatedAt,
      failedHeadErrorReason: headIntent.errorReason,
    };
  }

  async cancelPendingIntents(
    strategyKey: string,
    errorReason: string,
  ): Promise<number> {
    const pendingIntents = await this.strategyOrderIntentRepository.find({
      where: {
        strategyKey,
        status: In(CANCELLABLE_INTENT_STATUSES),
      },
      order: {
        createdAt: 'ASC',
        intentId: 'ASC',
      },
    });

    if (pendingIntents.length === 0) {
      return 0;
    }

    const updatedAt = getRFC3339Timestamp();

    for (const intent of pendingIntents) {
      intent.status = 'CANCELLED';
      intent.errorReason = errorReason;
      intent.updatedAt = updatedAt;
    }

    await this.strategyOrderIntentRepository.save(pendingIntents);

    return pendingIntents.length;
  }
}
