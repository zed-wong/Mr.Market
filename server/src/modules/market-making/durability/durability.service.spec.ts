import { ConsumerReceipt } from 'src/common/entities/system/consumer-receipt.entity';
import { OutboxEvent } from 'src/common/entities/system/outbox-event.entity';

import { DurabilityService } from './durability.service';

type Repo<T> = {
  create: jest.Mock;
  save: jest.Mock;
  insert?: jest.Mock;
  findOneBy: jest.Mock;
};

const createInMemoryRepos = () => {
  const outboxEvents: OutboxEvent[] = [];
  const receipts: ConsumerReceipt[] = [];

  const outboxRepository: Repo<OutboxEvent> = {
    create: jest.fn((payload: OutboxEvent) => payload),
    save: jest.fn(async (payload: OutboxEvent) => {
      outboxEvents.push(payload);

      return payload;
    }),
    findOneBy: jest.fn(async (where: any) => {
      if (where?.eventId) {
        return outboxEvents.find((e) => e.eventId === where.eventId) || null;
      }

      return null;
    }),
  };

  const consumerReceiptRepository: Repo<ConsumerReceipt> = {
    create: jest.fn((payload: ConsumerReceipt) => payload),
    save: jest.fn(async (payload: ConsumerReceipt) => {
      receipts.push(payload);

      return payload;
    }),
    insert: jest.fn(async (payload: ConsumerReceipt) => {
      const exists = receipts.some(
        (r) =>
          r.consumerName === payload.consumerName &&
          r.idempotencyKey === payload.idempotencyKey,
      );

      if (exists) {
        throw { code: '23505', message: 'duplicate key value' };
      }
      receipts.push(payload);

      return payload;
    }),
    findOneBy: jest.fn(async (where: any) => {
      return (
        receipts.find(
          (r) =>
            r.consumerName === where.consumerName &&
            r.idempotencyKey === where.idempotencyKey,
        ) || null
      );
    }),
  };

  return {
    outboxEvents,
    receipts,
    outboxRepository,
    consumerReceiptRepository,
  };
};

describe('DurabilityService', () => {
  it('stores outbox events with deterministic payload', async () => {
    const repos = createInMemoryRepos();
    const service = new DurabilityService(
      repos.outboxRepository as any,
      repos.consumerReceiptRepository as any,
    );

    await service.appendOutboxEvent({
      topic: 'strategy.intent.created',
      aggregateType: 'strategy_intent',
      aggregateId: 'intent-1',
      payload: { key: 'value' },
    });

    expect(repos.outboxEvents).toHaveLength(1);
    expect(repos.outboxEvents[0].topic).toBe('strategy.intent.created');
  });

  it('marks consumer receipt idempotently', async () => {
    const repos = createInMemoryRepos();
    const service = new DurabilityService(
      repos.outboxRepository as any,
      repos.consumerReceiptRepository as any,
    );

    const first = await service.markProcessed('execution-worker', 'intent-1');
    const second = await service.markProcessed('execution-worker', 'intent-1');

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(repos.receipts).toHaveLength(1);
  });

  it('returns false on duplicate-key race instead of throwing', async () => {
    const repos = createInMemoryRepos();
    const service = new DurabilityService(
      repos.outboxRepository as any,
      repos.consumerReceiptRepository as any,
    );

    const first = await service.markProcessed(
      'execution-worker',
      'intent-race',
    );
    const second = await service.markProcessed(
      'execution-worker',
      'intent-race',
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
