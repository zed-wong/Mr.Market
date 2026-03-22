import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { ConsumerReceipt } from 'src/common/entities/system/consumer-receipt.entity';
import { OutboxEvent } from 'src/common/entities/system/outbox-event.entity';
import { DurabilityService } from 'src/modules/market-making/durability/durability.service';
import type { Repository } from 'typeorm';

import { createSystemTestDatabaseConfig } from '../../helpers/sandbox-system.helper';
import { createSystemTestLogger } from '../../helpers/system-test-log.helper';

const log = createSystemTestLogger('durability-outbox-consumer-receipt');

describe('DurabilityService persistence parity (system)', () => {
  jest.setTimeout(240000);

  const databaseConfig = createSystemTestDatabaseConfig(
    'durability-outbox-consumer-receipt',
  );

  let moduleRef: TestingModule;
  let durabilityService: DurabilityService;
  let consumerReceiptRepository: Repository<ConsumerReceipt>;
  let outboxRepository: Repository<OutboxEvent>;

  beforeAll(async () => {
    log.suite('initializing durability system module', {
      databasePath: databaseConfig.databasePath,
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          ...databaseConfig.options,
          dropSchema: true,
          entities: [OutboxEvent, ConsumerReceipt],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([OutboxEvent, ConsumerReceipt]),
      ],
      providers: [DurabilityService],
    }).compile();

    durabilityService = moduleRef.get(DurabilityService);
    consumerReceiptRepository = moduleRef.get(
      getRepositoryToken(ConsumerReceipt),
    );
    outboxRepository = moduleRef.get(getRepositoryToken(OutboxEvent));

    log.suite('durability system module ready');
  });

  afterAll(async () => {
    await moduleRef?.close();
    databaseConfig.cleanup();
    log.suite('durability system module closed');
  });

  it('appends an outbox event into sqlite storage', async () => {
    log.step('appending outbox event');

    const created = await durabilityService.appendOutboxEvent({
      topic: 'strategy.intent.created',
      aggregateType: 'strategy_intent',
      aggregateId: 'intent-1',
      payload: {
        intentId: 'intent-1',
        status: 'NEW',
      },
    });

    const stored = await outboxRepository.findOneByOrFail({
      eventId: created.eventId,
    });

    log.result('outbox event stored', {
      eventId: stored.eventId,
      topic: stored.topic,
      createdAt: stored.createdAt,
    });

    expect(stored.eventId).toBeTruthy();
    expect(stored.createdAt).toBeTruthy();
    expect(stored.topic).toBe('strategy.intent.created');
    expect(stored.aggregateType).toBe('strategy_intent');
    expect(stored.aggregateId).toBe('intent-1');
    expect(JSON.parse(stored.payload)).toEqual({
      intentId: 'intent-1',
      status: 'NEW',
    });
  });

  it('marks a consumer receipt as processed on the first write', async () => {
    log.step('marking receipt processed for the first time');

    const created = await durabilityService.markProcessed(
      'execution-worker',
      'intent-2',
    );
    const stored = await consumerReceiptRepository.findOneByOrFail({
      consumerName: 'execution-worker',
      idempotencyKey: 'intent-2',
    });

    log.result('consumer receipt stored', {
      receiptId: stored.receiptId,
      processedAt: stored.processedAt,
      status: stored.status,
    });

    expect(created).toBe(true);
    expect(stored.receiptId).toBeTruthy();
    expect(stored.processedAt).toBeTruthy();
    expect(stored.status).toBe('processed');
  });

  it('returns false when the same consumer receipt is written twice', async () => {
    log.step('writing duplicate consumer receipt');

    const first = await durabilityService.markProcessed(
      'execution-worker',
      'intent-3',
    );
    const second = await durabilityService.markProcessed(
      'execution-worker',
      'intent-3',
    );
    const stored = await consumerReceiptRepository.findBy({
      consumerName: 'execution-worker',
      idempotencyKey: 'intent-3',
    });

    log.result('duplicate receipt outcome collected', {
      first,
      second,
      storedCount: stored.length,
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(stored).toHaveLength(1);
  });
});
