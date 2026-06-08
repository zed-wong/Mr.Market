import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { In, Repository } from 'typeorm';

import { ExecutorAction } from '../config/executor-action.types';
import { StrategyExecutionCategory } from '../config/strategy-execution-category';
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
  private readonly latestIntentsByStrategy = new Map<
    string,
    StrategyOrderIntent[]
  >();

  constructor(
    @InjectRepository(StrategyOrderIntentEntity)
    private readonly strategyOrderIntentRepository: Repository<StrategyOrderIntentEntity>,
  ) {}

  createLimitOrderIntent(
    runtimeInstanceKey: string,
    strategyKey: string,
    userId: string,
    clientId: string,
    exchange: string,
    pair: string,
    side: 'buy' | 'sell',
    price: BigNumber,
    qty: BigNumber,
    ts: string,
    suffix: string,
    executionCategory?: StrategyExecutionCategory,
    metadata?: Record<string, unknown>,
    postOnly?: boolean,
    accountLabel?: string,
    timeInForce?: 'GTC' | 'IOC',
  ): StrategyOrderIntent {
    return {
      type: 'CREATE_LIMIT_ORDER',
      intentId: `${strategyKey}:${ts}:${suffix}`,
      runtimeInstanceKey,
      strategyKey,
      userId,
      clientId,
      exchange,
      accountLabel,
      pair,
      side,
      price: price.toFixed(),
      qty: qty.toFixed(),
      executionCategory,
      postOnly,
      timeInForce,
      metadata,
      createdAt: ts,
      status: 'NEW',
    };
  }

  async publishIntents(
    strategyKey: string,
    intents: ExecutorAction[],
    dispatchActions: (
      strategyKey: string,
      intents: ExecutorAction[],
    ) => Promise<StrategyOrderIntent[] | undefined>,
  ): Promise<StrategyOrderIntent[]> {
    if (intents.length === 0) {
      return [];
    }

    const publishedIntents = await dispatchActions(strategyKey, intents);

    if (publishedIntents && publishedIntents.length > 0) {
      this.latestIntentsByStrategy.set(strategyKey, publishedIntents);

      return publishedIntents;
    }

    throw new Error('executor orchestrator did not publish intents');
  }

  getLatestIntentsForStrategy(strategyKey: string): StrategyOrderIntent[] {
    return this.latestIntentsByStrategy.get(strategyKey) || [];
  }

  clearLatestIntentsForStrategy(strategyKey: string): void {
    this.latestIntentsByStrategy.delete(strategyKey);
  }

  async upsertIntent(intent: StrategyOrderIntent): Promise<void> {
    await this.batchUpsertIntents([intent]);
  }

  async batchUpsertIntents(intents: StrategyOrderIntent[]): Promise<void> {
    if (intents.length === 0) {
      return;
    }

    const existingRows = await this.strategyOrderIntentRepository.find({
      where: { intentId: In(intents.map((intent) => intent.intentId)) },
    });
    const existingByIntentId = new Map(
      existingRows.map((row) => [row.intentId, row]),
    );
    const payloads = intents.map((intent) => {
      const existing = existingByIntentId.get(intent.intentId);
      const payload = this.toIntentEntity(intent, existing?.createdAt);

      return existing ? { ...existing, ...payload } : payload;
    });

    await this.strategyOrderIntentRepository.save(payloads);
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

  async getMixinOrderId(intentId: string): Promise<string | undefined> {
    const existing = await this.strategyOrderIntentRepository.findOneBy({
      intentId,
    });

    return existing?.mixinOrderId ?? undefined;
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

  async listInterruptedCreateIntents(
    strategyKey: string,
  ): Promise<StrategyOrderIntentEntity[]> {
    return await this.strategyOrderIntentRepository.find({
      where: {
        strategyKey,
        type: 'CREATE_LIMIT_ORDER',
        status: In(['SENT', 'ACKED'] as StrategyIntentStatus[]),
      },
      order: {
        createdAt: 'ASC',
        intentId: 'ASC',
      },
    });
  }

  async listInterruptedCancelIntents(
    strategyKey: string,
  ): Promise<StrategyOrderIntentEntity[]> {
    return await this.strategyOrderIntentRepository.find({
      where: {
        strategyKey,
        type: 'CANCEL_ORDER',
        status: In(['SENT', 'ACKED'] as StrategyIntentStatus[]),
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

  async cancelPendingRiskIncreasingIntents(
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
    const cancellableIntents = pendingIntents.filter(
      (intent) =>
        intent.type !== 'STOP_CONTROLLER' && intent.type !== 'CANCEL_ORDER',
    );

    if (cancellableIntents.length === 0) {
      return 0;
    }

    const updatedAt = getRFC3339Timestamp();

    for (const intent of cancellableIntents) {
      intent.status = 'CANCELLED';
      intent.errorReason = errorReason;
      intent.updatedAt = updatedAt;
    }

    await this.strategyOrderIntentRepository.save(cancellableIntents);

    return cancellableIntents.length;
  }

  private toIntentEntity(
    intent: StrategyOrderIntent,
    existingCreatedAt?: string,
  ): StrategyOrderIntentEntity {
    return {
      intentId: intent.intentId,
      runtimeInstanceKey: intent.runtimeInstanceKey,
      strategyKey: intent.strategyKey,
      userId: intent.userId,
      clientId: intent.clientId,
      type: intent.type,
      exchange: intent.exchange,
      accountLabel: intent.accountLabel,
      pair: intent.pair,
      side: intent.side,
      price: intent.price,
      qty: intent.qty,
      mixinOrderId: intent.mixinOrderId,
      executionCategory: intent.executionCategory,
      postOnly: intent.postOnly,
      timeInForce: intent.timeInForce,
      slotKey: intent.slotKey,
      metadata: intent.metadata,
      status: intent.status,
      errorReason: undefined,
      createdAt: existingCreatedAt || intent.createdAt,
      updatedAt: getRFC3339Timestamp(),
    };
  }
}
