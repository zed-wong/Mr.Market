import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { ConsumerReceipt } from 'src/common/entities/system/consumer-receipt.entity';
import { OutboxEvent } from 'src/common/entities/system/outbox-event.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Repository } from 'typeorm';

type AppendOutboxCommand = {
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class DurabilityService {
  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
    @InjectRepository(ConsumerReceipt)
    private readonly consumerReceiptRepository: Repository<ConsumerReceipt>,
  ) {}

  async appendOutboxEvent(command: AppendOutboxCommand): Promise<OutboxEvent> {
    const event = this.outboxRepository.create({
      eventId: randomUUID(),
      topic: command.topic,
      aggregateType: command.aggregateType,
      aggregateId: command.aggregateId,
      payload: JSON.stringify(command.payload),
      createdAt: getRFC3339Timestamp(),
    });

    return await this.outboxRepository.save(event);
  }

  async markProcessed(
    consumerName: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const receipt = this.consumerReceiptRepository.create({
      receiptId: randomUUID(),
      consumerName,
      idempotencyKey,
      status: 'processed',
      processedAt: getRFC3339Timestamp(),
    });

    try {
      if (
        typeof (this.consumerReceiptRepository as any).insert === 'function'
      ) {
        await (this.consumerReceiptRepository as any).insert(receipt);
      } else {
        const existing = await this.consumerReceiptRepository.findOneBy({
          consumerName,
          idempotencyKey,
        });

        if (existing) {
          return false;
        }
        await this.consumerReceiptRepository.save(receipt);
      }

      return true;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  async isProcessed(
    consumerName: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const existing = await this.consumerReceiptRepository.findOneBy({
      consumerName,
      idempotencyKey,
    });

    return Boolean(existing);
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const code = (error as { code?: string }).code;
    const message = String((error as { message?: string }).message || '');

    return code === '23505' || message.toLowerCase().includes('duplicate');
  }
}
