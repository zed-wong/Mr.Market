import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { randomUUID } from 'crypto';
import { BalanceReadModel } from 'src/common/entities/ledger/balance-read-model.entity';
import {
  LedgerEntry,
  LedgerEntryType,
} from 'src/common/entities/ledger/ledger-entry.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { DataSource, Repository } from 'typeorm';

import { DurabilityService } from '../durability/durability.service';

type BalanceLedgerCommand = {
  userId: string;
  assetId: string;
  amount: string;
  idempotencyKey: string;
  refType?: string;
  refId?: string;
};

type BalanceLedgerResult = {
  applied: boolean;
  entry: LedgerEntry;
  balance: BalanceReadModel;
};

@Injectable()
export class BalanceLedgerService {
  private readonly balanceMutationLocks = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository: Repository<LedgerEntry>,
    @InjectRepository(BalanceReadModel)
    private readonly balanceReadModelRepository: Repository<BalanceReadModel>,
    @Optional()
    private readonly durabilityService?: DurabilityService,
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  async creditDeposit(
    command: BalanceLedgerCommand,
  ): Promise<BalanceLedgerResult> {
    return await this.applyMutation('DEPOSIT_CREDIT', command);
  }

  async lockFunds(command: BalanceLedgerCommand): Promise<BalanceLedgerResult> {
    return await this.applyMutation('LOCK', command);
  }

  async unlockFunds(
    command: BalanceLedgerCommand,
  ): Promise<BalanceLedgerResult> {
    return await this.applyMutation('UNLOCK', command);
  }

  async creditReward(
    command: BalanceLedgerCommand,
  ): Promise<BalanceLedgerResult> {
    return await this.applyMutation('REWARD_CREDIT', command);
  }

  async debitWithdrawal(
    command: BalanceLedgerCommand,
  ): Promise<BalanceLedgerResult> {
    return await this.applyMutation('WITHDRAW_DEBIT', command);
  }

  async debitFee(command: BalanceLedgerCommand): Promise<BalanceLedgerResult> {
    return await this.applyMutation('FEE_DEBIT', command);
  }

  async adjust(command: BalanceLedgerCommand): Promise<BalanceLedgerResult> {
    return await this.applyMutation('ADJUSTMENT', command);
  }

  async getBalance(userId: string, assetId: string): Promise<BalanceReadModel> {
    return await this.getOrCreateBalance(userId, assetId);
  }

  private async applyMutation(
    type: LedgerEntryType,
    command: BalanceLedgerCommand,
  ): Promise<BalanceLedgerResult> {
    const lockKey = this.getBalanceLockKey(command.userId, command.assetId);
    const result = await this.withBalanceMutationLock(lockKey, async () => {
      const execute = async (
        ledgerEntryRepository: Repository<LedgerEntry>,
        balanceReadModelRepository: Repository<BalanceReadModel>,
      ) =>
        await this.applyMutationWithRepositories(
          type,
          command,
          ledgerEntryRepository,
          balanceReadModelRepository,
        );

      if (this.dataSource) {
        try {
          return await this.dataSource.transaction(async (manager) => {
            return await execute(
              manager.getRepository(LedgerEntry),
              manager.getRepository(BalanceReadModel),
            );
          });
        } catch (error) {
          if (this.isUniqueViolation(error)) {
            const existingEntry = await this.ledgerEntryRepository.findOneBy({
              idempotencyKey: command.idempotencyKey,
            });

            if (existingEntry) {
              const balance = await this.getOrCreateBalance(
                command.userId,
                command.assetId,
              );

              return { applied: false, entry: existingEntry, balance };
            }
          }
          throw error;
        }
      }

      return await execute(
        this.ledgerEntryRepository,
        this.balanceReadModelRepository,
      );
    });

    if (result.applied) {
      await this.durabilityService?.appendOutboxEvent({
        topic: 'ledger.entry.created',
        aggregateType: 'ledger_entry',
        aggregateId: result.entry.entryId,
        payload: {
          userId: result.entry.userId,
          assetId: result.entry.assetId,
          type: result.entry.type,
          amount: result.entry.amount,
          idempotencyKey: result.entry.idempotencyKey,
        },
      });
    }

    return result;
  }

  private getBalanceLockKey(userId: string, assetId: string): string {
    return `${userId}:${assetId}`;
  }

  private async withBalanceMutationLock<T>(
    lockKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const currentTail =
      this.balanceMutationLocks.get(lockKey) || Promise.resolve();
    let releaseCurrent: () => void = () => {};
    const nextTail = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });

    this.balanceMutationLocks.set(
      lockKey,
      currentTail.then(() => nextTail),
    );
    await currentTail;

    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (this.balanceMutationLocks.get(lockKey) === nextTail) {
        this.balanceMutationLocks.delete(lockKey);
      }
    }
  }

  private async applyMutationWithRepositories(
    type: LedgerEntryType,
    command: BalanceLedgerCommand,
    ledgerEntryRepository: Repository<LedgerEntry>,
    balanceReadModelRepository: Repository<BalanceReadModel>,
  ): Promise<BalanceLedgerResult> {
    const existingEntry = await ledgerEntryRepository.findOneBy({
      idempotencyKey: command.idempotencyKey,
    });

    if (existingEntry) {
      const balance = await this.getOrCreateBalanceWithRepository(
        command.userId,
        command.assetId,
        balanceReadModelRepository,
      );

      return { applied: false, entry: existingEntry, balance };
    }

    const amountBn = new BigNumber(command.amount);

    if (!amountBn.isFinite() || amountBn.isZero()) {
      throw new BadRequestException('amount must be a non-zero numeric string');
    }

    if (type !== 'ADJUSTMENT' && amountBn.isLessThanOrEqualTo(0)) {
      throw new BadRequestException('amount must be greater than zero');
    }

    const balance = await this.getOrCreateBalanceWithRepository(
      command.userId,
      command.assetId,
      balanceReadModelRepository,
    );
    const availableBn = new BigNumber(balance.available);
    const lockedBn = new BigNumber(balance.locked);

    let nextAvailable = availableBn;
    let nextLocked = lockedBn;
    let signedEntryAmount = amountBn;

    if (type === 'DEPOSIT_CREDIT' || type === 'REWARD_CREDIT') {
      nextAvailable = availableBn.plus(amountBn);
      signedEntryAmount = amountBn;
    }

    if (type === 'WITHDRAW_DEBIT' || type === 'FEE_DEBIT') {
      if (availableBn.isLessThan(amountBn)) {
        throw new BadRequestException('insufficient available balance');
      }
      nextAvailable = availableBn.minus(amountBn);
      signedEntryAmount = amountBn.negated();
    }

    if (type === 'LOCK') {
      if (availableBn.isLessThan(amountBn)) {
        throw new BadRequestException(
          'insufficient available balance for lock',
        );
      }
      nextAvailable = availableBn.minus(amountBn);
      nextLocked = lockedBn.plus(amountBn);
      signedEntryAmount = amountBn;
    }

    if (type === 'UNLOCK') {
      if (lockedBn.isLessThan(amountBn)) {
        throw new BadRequestException('insufficient locked balance for unlock');
      }
      nextAvailable = availableBn.plus(amountBn);
      nextLocked = lockedBn.minus(amountBn);
      signedEntryAmount = amountBn;
    }

    if (type === 'MM_REALIZED_PNL' || type === 'ADJUSTMENT') {
      nextAvailable = availableBn.plus(amountBn);
      signedEntryAmount = amountBn;
    }

    if (nextAvailable.isLessThan(0) || nextLocked.isLessThan(0)) {
      throw new BadRequestException('balance cannot become negative');
    }

    const now = getRFC3339Timestamp();
    const entry = ledgerEntryRepository.create({
      entryId: randomUUID(),
      userId: command.userId,
      assetId: command.assetId,
      amount: signedEntryAmount.toFixed(),
      type,
      refType: command.refType,
      refId: command.refId,
      idempotencyKey: command.idempotencyKey,
      createdAt: now,
    });

    try {
      await ledgerEntryRepository.save(entry);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const existing = await ledgerEntryRepository.findOneBy({
          idempotencyKey: command.idempotencyKey,
        });

        if (existing) {
          const unchangedBalance = await this.getOrCreateBalanceWithRepository(
            command.userId,
            command.assetId,
            balanceReadModelRepository,
          );

          return { applied: false, entry: existing, balance: unchangedBalance };
        }
      }
      throw error;
    }

    const nextTotal = nextAvailable.plus(nextLocked);

    balance.available = nextAvailable.toFixed();
    balance.locked = nextLocked.toFixed();
    balance.total = nextTotal.toFixed();
    balance.updatedAt = now;
    await balanceReadModelRepository.save(balance);

    return { applied: true, entry, balance };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const code = (error as { code?: string }).code;
    const message = String((error as { message?: string }).message || '');

    return code === '23505' || message.toLowerCase().includes('duplicate');
  }

  private async getOrCreateBalance(
    userId: string,
    assetId: string,
  ): Promise<BalanceReadModel> {
    return await this.getOrCreateBalanceWithRepository(
      userId,
      assetId,
      this.balanceReadModelRepository,
    );
  }

  private async getOrCreateBalanceWithRepository(
    userId: string,
    assetId: string,
    balanceReadModelRepository: Repository<BalanceReadModel>,
  ): Promise<BalanceReadModel> {
    const existing = await balanceReadModelRepository.findOneBy({
      userId,
      assetId,
    });

    if (existing) {
      return existing;
    }

    const newBalance = balanceReadModelRepository.create({
      userId,
      assetId,
      available: '0',
      locked: '0',
      total: '0',
      updatedAt: getRFC3339Timestamp(),
    });

    return await balanceReadModelRepository.save(newBalance);
  }
}
