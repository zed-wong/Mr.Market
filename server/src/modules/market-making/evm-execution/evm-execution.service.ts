import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import {
  EvmExecution,
  EvmExecutionStatus,
  EvmExecutionType,
} from 'src/common/entities/market-making/evm-execution.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Repository } from 'typeorm';

export type CreateEvmExecutionCommand = {
  parentExecutionId?: string;
  executionType: EvmExecutionType;
  userOrderId: string;
  ledgerOrderId: string;
  accountLabel?: string;
  intentId: string;
  connectorId: string;
  exchangeType: string;
  chainId: number;
  tradingAccountId: string;
  nonce: number;
  requiredConfirmations: number;
  gasSponsorLedgerOrderId?: string;
};

export type ConfirmEvmExecutionCommand = {
  blockNumber: number;
  confirmationCount: number;
  receipt: Record<string, unknown>;
  decodedEvents?: Record<string, unknown>;
  gasUsed?: string;
  gasPrice?: string;
  effectiveGasCost?: string;
};

@Injectable()
export class EvmExecutionService {
  constructor(
    @InjectRepository(EvmExecution)
    private readonly evmExecutionRepository: Repository<EvmExecution>,
  ) {}

  async createCreated(
    command: CreateEvmExecutionCommand,
  ): Promise<EvmExecution> {
    const now = getRFC3339Timestamp();
    const execution = this.evmExecutionRepository.create({
      id: randomUUID(),
      parentExecutionId: command.parentExecutionId,
      executionType: command.executionType,
      userOrderId: command.userOrderId,
      ledgerOrderId: command.ledgerOrderId,
      accountLabel: command.accountLabel || 'default',
      intentId: command.intentId,
      connectorId: command.connectorId,
      exchangeType: command.exchangeType,
      chainId: command.chainId,
      tradingAccountId: command.tradingAccountId,
      nonce: command.nonce,
      status: 'created',
      requiredConfirmations: command.requiredConfirmations,
      gasSponsorLedgerOrderId: command.gasSponsorLedgerOrderId,
      createdAt: now,
      updatedAt: now,
    });

    return await this.evmExecutionRepository.save(execution);
  }

  async markSubmitted(
    executionId: string,
    txHash: string,
  ): Promise<EvmExecution> {
    const execution = await this.requireById(executionId);
    const now = getRFC3339Timestamp();

    execution.txHash = txHash;
    execution.status = 'submitted';
    execution.submittedAt = now;
    execution.updatedAt = now;

    return await this.evmExecutionRepository.save(execution);
  }

  async markConfirmed(
    executionId: string,
    command: ConfirmEvmExecutionCommand,
  ): Promise<EvmExecution> {
    const execution = await this.requireById(executionId);
    const now = getRFC3339Timestamp();

    execution.status = 'confirmed';
    execution.confirmedAt = now;
    execution.blockNumber = command.blockNumber;
    execution.confirmationCount = command.confirmationCount;
    execution.receiptContentHash = this.hashReceipt(command.receipt);
    execution.decodedEvents = command.decodedEvents;
    execution.gasUsed = command.gasUsed;
    execution.gasPrice = command.gasPrice;
    execution.effectiveGasCost = command.effectiveGasCost;
    execution.updatedAt = now;

    return await this.evmExecutionRepository.save(execution);
  }

  async markReverted(
    executionId: string,
    command: ConfirmEvmExecutionCommand,
  ): Promise<EvmExecution> {
    const execution = await this.markConfirmed(executionId, command);

    execution.status = 'reverted';

    return await this.evmExecutionRepository.save(execution);
  }

  async markFailed(
    executionId: string,
    status: EvmExecutionStatus = 'failed',
  ): Promise<EvmExecution> {
    const execution = await this.requireById(executionId);

    execution.status = status;
    execution.updatedAt = getRFC3339Timestamp();

    return await this.evmExecutionRepository.save(execution);
  }

  async markManualReview(
    executionId: string,
    reason: string,
  ): Promise<EvmExecution> {
    const execution = await this.requireById(executionId);

    execution.status = 'manual_review';
    execution.manualReviewReason = reason;
    execution.updatedAt = getRFC3339Timestamp();

    return await this.evmExecutionRepository.save(execution);
  }

  async recordPendingObservation(
    executionId: string,
    blockNumber: number,
  ): Promise<EvmExecution> {
    const execution = await this.requireById(executionId);

    if (!execution.firstPendingBlockNumber) {
      execution.firstPendingBlockNumber = blockNumber;
    }

    execution.lastCheckedBlockNumber = blockNumber;
    execution.updatedAt = getRFC3339Timestamp();

    return await this.evmExecutionRepository.save(execution);
  }

  async findById(executionId: string): Promise<EvmExecution | null> {
    return await this.evmExecutionRepository.findOneBy({ id: executionId });
  }

  async requireById(executionId: string): Promise<EvmExecution> {
    const execution = await this.findById(executionId);

    if (!execution) {
      throw new Error(`EvmExecution ${executionId} not found`);
    }

    return execution;
  }

  async findByIntentId(intentId: string): Promise<EvmExecution | null> {
    return await this.evmExecutionRepository.findOne({
      where: { intentId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async listPending(): Promise<EvmExecution[]> {
    return await this.evmExecutionRepository.find({
      where: [{ status: 'created' }, { status: 'submitted' }],
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }

  async listConfirmedForReorgCheck(): Promise<EvmExecution[]> {
    return await this.evmExecutionRepository.find({
      where: { status: 'confirmed' },
      order: { confirmedAt: 'ASC', id: 'ASC' },
    });
  }

  hashReceiptForComparison(receipt: Record<string, unknown>): string {
    return this.hashReceipt(receipt);
  }

  async getMaxAllocatedNonce(
    tradingAccountId: string,
    chainId: number,
  ): Promise<number | null> {
    const row = await this.evmExecutionRepository
      .createQueryBuilder('execution')
      .select('MAX(execution.nonce)', 'maxNonce')
      .where('execution.tradingAccountId = :tradingAccountId', {
        tradingAccountId,
      })
      .andWhere('execution.chainId = :chainId', { chainId })
      .getRawOne<{ maxNonce: number | string | null }>();
    const maxNonce = Number(row?.maxNonce);

    return Number.isFinite(maxNonce) ? maxNonce : null;
  }

  private hashReceipt(receipt: Record<string, unknown>): string {
    return createHash('sha256')
      .update(JSON.stringify(receipt))
      .digest('hex');
  }
}
