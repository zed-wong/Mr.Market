import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { createHash, randomUUID } from 'crypto';
import {
  LedgerEntry,
  LedgerEntryType,
} from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import {
  getRFC3339Timestamp,
  isUniqueConstraintViolation,
} from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { DataSource, Repository } from 'typeorm';

import { DurabilityService } from '../durability/durability.service';

type BalanceLedgerCommand = {
  orderId: string;
  userId: string;
  assetId: string;
  amount: string;
  idempotencyKey: string;
  refType?: string;
  refId?: string;
  reversalOf?: string;
};

type BalanceLedgerResult = {
  applied: boolean;
  entry: LedgerEntry;
  balance: MarketMakingOrderBalance;
};

export type ReservationPauseMetadata = {
  source?: string;
  reason?: string;
  strategyKey?: string;
  refType?: string;
  refId?: string;
};

export type LedgerRebuildResult = {
  expected: MarketMakingOrderBalance;
  actual: MarketMakingOrderBalance;
  matches: boolean;
};

@Injectable()
export class BalanceLedgerService {
  private static readonly transactionLockKey = '__ledger_transaction__';
  private static readonly transactionMutationLocks = new Map<
    string,
    Promise<void>
  >();

  private readonly logger = new CustomLogger(BalanceLedgerService.name);
  private readonly balanceMutationLocks = new Map<string, Promise<void>>();
  private readonly reservationPausedBalances = new Set<string>();

  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository: Repository<LedgerEntry>,
    @InjectRepository(MarketMakingOrderBalance)
    private readonly orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    @Optional()
    private readonly durabilityService?: DurabilityService,
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  async creditDeposit(
    command: BalanceLedgerCommand,
  ): Promise<BalanceLedgerResult> {
    return await this.applyMutation('deposit_credit', command);
  }

  async lockFunds(command: BalanceLedgerCommand): Promise<BalanceLedgerResult> {
    return await this.applyMutation('reserve_lock', command);
  }

  async unlockFunds(
    command: BalanceLedgerCommand,
  ): Promise<BalanceLedgerResult> {
    return await this.applyMutation('reserve_release', command);
  }

  async creditReward(
    command: BalanceLedgerCommand,
  ): Promise<BalanceLedgerResult> {
    return await this.applyMutation('reward_credit', command);
  }

  async debitWithdrawal(
    command: BalanceLedgerCommand,
  ): Promise<BalanceLedgerResult> {
    return await this.applyMutation('withdraw_debit', command);
  }

  async debitFee(command: BalanceLedgerCommand): Promise<BalanceLedgerResult> {
    return await this.applyMutation('fee_debit', command);
  }

  async adjust(command: BalanceLedgerCommand): Promise<BalanceLedgerResult> {
    return await this.applyMutation('fill_settle', command);
  }

  async reverse(command: BalanceLedgerCommand): Promise<BalanceLedgerResult> {
    return await this.applyMutation('reversal', command);
  }

  async getBalance(
    orderId: string,
    assetId: string,
  ): Promise<MarketMakingOrderBalance> {
    return await this.getOrCreateBalance(orderId, assetId);
  }

  async getExistingBalance(
    orderId: string,
    assetId: string,
  ): Promise<MarketMakingOrderBalance | null> {
    return await this.orderBalanceRepository.findOneBy({ orderId, assetId });
  }

  async hasDepositCredit(orderId: string, assetId: string): Promise<boolean> {
    const existing = await this.ledgerEntryRepository.findOne({
      where: {
        orderId,
        assetId,
        type: 'deposit_credit',
      },
    });

    return Boolean(existing);
  }

  async findByOrderId(orderId: string): Promise<LedgerEntry[]> {
    return await this.ledgerEntryRepository.find({
      where: { orderId },
      order: { createdAt: 'ASC', entryId: 'ASC' },
    });
  }

  async getLockedBalanceForUserAsset(
    userId: string,
    assetId: string,
  ): Promise<string> {
    const balances = await this.orderBalanceRepository.find({
      where: { userId, assetId },
    });

    return balances
      .reduce(
        (total, balance) => total.plus(balance.locked || 0),
        new BigNumber(0),
      )
      .toFixed();
  }

  pauseReservations(
    orderId: string,
    assetId: string,
    metadata: ReservationPauseMetadata = {},
  ): void {
    const lockKey = this.getBalanceLockKey(orderId, assetId);
    const alreadyPaused = this.reservationPausedBalances.has(lockKey);

    this.reservationPausedBalances.add(lockKey);

    this.logger.warn(
      [
        'reservation_pause',
        `orderId=${orderId}`,
        `assetId=${assetId}`,
        `alreadyPaused=${alreadyPaused}`,
        `source=${metadata.source || 'unknown'}`,
        `reason=${metadata.reason || 'unknown'}`,
        `strategy=${metadata.strategyKey || 'unknown'}`,
        `refType=${metadata.refType || 'unknown'}`,
        `refId=${metadata.refId || 'unknown'}`,
      ].join(' | '),
    );
  }

  isReservationPaused(orderId: string, assetId: string): boolean {
    return this.reservationPausedBalances.has(
      this.getBalanceLockKey(orderId, assetId),
    );
  }

  async rebuildOrderBalance(
    orderId: string,
    assetId: string,
  ): Promise<LedgerRebuildResult> {
    const [entries, actual] = await Promise.all([
      this.ledgerEntryRepository.find({ where: { orderId, assetId } }),
      this.getOrCreateBalance(orderId, assetId),
    ]);

    const expected = this.projectBalanceFromEntries(orderId, assetId, entries);
    const matches =
      actual.userId === expected.userId &&
      actual.available === expected.available &&
      actual.locked === expected.locked &&
      actual.total === expected.total &&
      actual.initialDeposit === expected.initialDeposit &&
      actual.realizedDelta === expected.realizedDelta &&
      actual.feePaid === expected.feePaid;

    const lockKey = this.getBalanceLockKey(orderId, assetId);

    if (matches) {
      this.reservationPausedBalances.delete(lockKey);
    } else {
      this.reservationPausedBalances.add(lockKey);
    }

    return { expected, actual, matches };
  }

  private async applyMutation(
    type: LedgerEntryType,
    command: BalanceLedgerCommand,
  ): Promise<BalanceLedgerResult> {
    const lockKey = this.getMutationLockKey(command.orderId, command.assetId);
    const result = await this.withBalanceMutationLock(lockKey, async () => {
      const execute = async (
        ledgerEntryRepository: Repository<LedgerEntry>,
        orderBalanceRepository: Repository<MarketMakingOrderBalance>,
      ) =>
        await this.applyMutationWithRepositories(
          type,
          command,
          ledgerEntryRepository,
          orderBalanceRepository,
        );

      if (this.shouldUseDataSourceTransaction()) {
        try {
          return await this.dataSource.transaction(async (manager) => {
            return await execute(
              manager.getRepository(LedgerEntry),
              manager.getRepository(MarketMakingOrderBalance),
            );
          });
        } catch (error) {
          if (this.isUniqueViolation(error)) {
            const existingEntry = await this.ledgerEntryRepository.findOneBy({
              idempotencyKey: command.idempotencyKey,
            });

            if (existingEntry) {
              await this.assertIdempotencyPayloadMatches(
                existingEntry,
                type,
                command,
              );
              const balance = await this.getOrCreateBalance(
                command.orderId,
                command.assetId,
                false,
              );

              return { applied: false, entry: existingEntry, balance };
            }
          }
          throw error;
        }
      }

      return await execute(
        this.ledgerEntryRepository,
        this.orderBalanceRepository,
      );
    });

    if (result.applied) {
      await this.durabilityService?.appendOutboxEvent({
        topic: 'ledger.entry.created',
        aggregateType: 'ledger_entry',
        aggregateId: result.entry.entryId,
        payload: {
          userId: result.entry.userId,
          orderId: result.entry.orderId,
          assetId: result.entry.assetId,
          type: result.entry.type,
          amount: result.entry.amount,
          idempotencyKey: result.entry.idempotencyKey,
          idempotencyContentHash: result.entry.idempotencyContentHash,
        },
      });
    }

    return result;
  }

  private getBalanceLockKey(orderId: string, assetId: string): string {
    return `${orderId}:${assetId}`;
  }

  private shouldUseDataSourceTransaction(): boolean {
    if (!this.dataSource) {
      return false;
    }

    const type = String(this.dataSource.options?.type || '').toLowerCase();

    return type !== 'sqlite' && type !== 'better-sqlite3' && type !== 'sqljs';
  }

  private getMutationLockKey(orderId: string, assetId: string): string {
    if (this.dataSource) {
      return BalanceLedgerService.transactionLockKey;
    }

    return this.getBalanceLockKey(orderId, assetId);
  }

  private async withBalanceMutationLock<T>(
    lockKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const mutationLocks =
      lockKey === BalanceLedgerService.transactionLockKey
        ? BalanceLedgerService.transactionMutationLocks
        : this.balanceMutationLocks;
    const currentTail = mutationLocks.get(lockKey) || Promise.resolve();
    let releaseCurrent: () => void = () => {};
    const nextTail = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });

    const chainedTail = currentTail.then(() => nextTail);

    mutationLocks.set(lockKey, chainedTail);
    await currentTail;

    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (mutationLocks.get(lockKey) === chainedTail) {
        mutationLocks.delete(lockKey);
      }
    }
  }

  private async applyMutationWithRepositories(
    type: LedgerEntryType,
    command: BalanceLedgerCommand,
    ledgerEntryRepository: Repository<LedgerEntry>,
    orderBalanceRepository: Repository<MarketMakingOrderBalance>,
  ): Promise<BalanceLedgerResult> {
    const existingEntry = await ledgerEntryRepository.findOneBy({
      idempotencyKey: command.idempotencyKey,
    });

    if (existingEntry) {
      await this.assertIdempotencyPayloadMatches(existingEntry, type, command);
      const balance = await this.getOrCreateBalanceWithRepository(
        command.orderId,
        command.assetId,
        orderBalanceRepository,
        false,
      );

      return { applied: false, entry: existingEntry, balance };
    }

    const amountBn = new BigNumber(command.amount);

    if (!amountBn.isFinite() || amountBn.isZero()) {
      throw new BadRequestException('amount must be a non-zero numeric string');
    }

    if (
      type !== 'fill_settle' &&
      type !== 'reward_credit' &&
      type !== 'reversal' &&
      amountBn.isLessThanOrEqualTo(0)
    ) {
      throw new BadRequestException('amount must be greater than zero');
    }

    const reversedEntry =
      type === 'reversal' && command.reversalOf
        ? await ledgerEntryRepository.findOneBy({
            entryId: command.reversalOf,
          })
        : null;

    const lockKey = this.getBalanceLockKey(command.orderId, command.assetId);

    if (
      type === 'reserve_lock' &&
      this.reservationPausedBalances.has(lockKey)
    ) {
      throw new BadRequestException(
        'reservation paused for order balance mismatch',
      );
    }

    const balance = await this.getOrCreateBalanceWithRepository(
      command.orderId,
      command.assetId,
      orderBalanceRepository,
      false,
    );

    balance.userId = command.userId;
    const availableBn = new BigNumber(balance.available);
    const lockedBn = new BigNumber(balance.locked);

    let nextAvailable = availableBn;
    let nextLocked = lockedBn;
    let signedEntryAmount = amountBn;

    if (type === 'deposit_credit' || type === 'reward_credit') {
      nextAvailable = availableBn.plus(amountBn);
      signedEntryAmount = amountBn;
    }

    if (type === 'withdraw_debit' || type === 'fee_debit') {
      if (availableBn.isLessThan(amountBn)) {
        throw new BadRequestException('insufficient available balance');
      }
      nextAvailable = availableBn.minus(amountBn);
      signedEntryAmount = amountBn.negated();
    }

    if (type === 'reserve_lock') {
      if (availableBn.isLessThan(amountBn)) {
        throw new BadRequestException(
          'insufficient available balance for lock',
        );
      }
      nextAvailable = availableBn.minus(amountBn);
      nextLocked = lockedBn.plus(amountBn);
      signedEntryAmount = amountBn;
    }

    if (type === 'reserve_release') {
      if (lockedBn.isLessThan(amountBn)) {
        throw new BadRequestException('insufficient locked balance for unlock');
      }
      nextAvailable = availableBn.plus(amountBn);
      nextLocked = lockedBn.minus(amountBn);
      signedEntryAmount = amountBn;
    }

    if (type === 'fill_settle') {
      if (amountBn.isNegative()) {
        const fillDebit = amountBn.abs();

        if (lockedBn.isLessThan(fillDebit)) {
          throw new BadRequestException(
            'insufficient locked balance for fill settlement',
          );
        }
        nextLocked = lockedBn.minus(fillDebit);
      } else {
        nextAvailable = availableBn.plus(amountBn);
      }
      signedEntryAmount = amountBn;
    }

    if (type === 'reversal') {
      nextAvailable = availableBn.plus(amountBn);
      signedEntryAmount = amountBn;
    }

    if (nextAvailable.isLessThan(0) || nextLocked.isLessThan(0)) {
      throw new BadRequestException('balance cannot become negative');
    }

    const now = getRFC3339Timestamp();
    const entry = ledgerEntryRepository.create({
      entryId: randomUUID(),
      orderId: command.orderId,
      userId: command.userId,
      assetId: command.assetId,
      amount: signedEntryAmount.toFixed(),
      type,
      refType: command.refType,
      refId: command.refId,
      idempotencyKey: command.idempotencyKey,
      idempotencyContentHash: this.buildIdempotencyContentHash(
        type,
        command,
        signedEntryAmount.toFixed(),
      ),
      reversalOf: command.reversalOf,
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
          await this.assertIdempotencyPayloadMatches(existing, type, command);
          const unchangedBalance = await this.getOrCreateBalanceWithRepository(
            command.orderId,
            command.assetId,
            orderBalanceRepository,
            false,
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
    balance.initialDeposit =
      type === 'deposit_credit'
        ? new BigNumber(balance.initialDeposit).plus(amountBn).toFixed()
        : balance.initialDeposit;
    balance.realizedDelta =
      type === 'fill_settle' ||
      type === 'reward_credit' ||
      this.shouldReversalAffectRealizedDelta(reversedEntry)
        ? new BigNumber(balance.realizedDelta).plus(signedEntryAmount).toFixed()
        : balance.realizedDelta;
    balance.feePaid = this.calculateNextFeePaid(
      balance.feePaid,
      type,
      amountBn,
      reversedEntry,
    );
    balance.updatedAt = now;
    await orderBalanceRepository.save(balance);

    return { applied: true, entry, balance };
  }

  private isUniqueViolation(error: unknown): boolean {
    return isUniqueConstraintViolation(error);
  }

  private calculateNextFeePaid(
    currentFeePaid: string,
    type: LedgerEntryType,
    amount: BigNumber,
    reversedEntry: LedgerEntry | null,
  ): string {
    const feePaid = new BigNumber(currentFeePaid);

    if (type === 'fee_debit') {
      return feePaid.plus(amount).toFixed();
    }

    if (type === 'reversal' && reversedEntry?.type === 'fee_debit') {
      return BigNumber.maximum(feePaid.minus(amount.abs()), 0).toFixed();
    }

    return currentFeePaid;
  }

  private shouldReversalAffectRealizedDelta(
    reversedEntry: LedgerEntry | null,
  ): boolean {
    if (!reversedEntry) {
      return false;
    }

    return (
      reversedEntry.type === 'fill_settle' ||
      reversedEntry.type === 'reward_credit' ||
      reversedEntry.type === 'reversal'
    );
  }

  private async getOrCreateBalance(
    orderId: string,
    assetId: string,
    persist = true,
  ): Promise<MarketMakingOrderBalance> {
    return await this.getOrCreateBalanceWithRepository(
      orderId,
      assetId,
      this.orderBalanceRepository,
      persist,
    );
  }

  private async getOrCreateBalanceWithRepository(
    orderId: string,
    assetId: string,
    orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    persist = true,
  ): Promise<MarketMakingOrderBalance> {
    const existing = await orderBalanceRepository.findOneBy({
      orderId,
      assetId,
    });

    if (existing) {
      return existing;
    }

    const newBalance = orderBalanceRepository.create({
      orderId,
      userId: '',
      assetId,
      available: '0',
      locked: '0',
      total: '0',
      initialDeposit: '0',
      realizedDelta: '0',
      feePaid: '0',
      updatedAt: getRFC3339Timestamp(),
    });

    if (!persist) {
      return newBalance;
    }

    return await orderBalanceRepository.save(newBalance);
  }

  private projectBalanceFromEntries(
    orderId: string,
    assetId: string,
    entries: LedgerEntry[],
  ): MarketMakingOrderBalance {
    const sortedEntries = [...entries].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    const firstUserId = sortedEntries[0]?.userId || '';
    const balance = this.orderBalanceRepository.create({
      orderId,
      userId: firstUserId,
      assetId,
      available: '0',
      locked: '0',
      total: '0',
      initialDeposit: '0',
      realizedDelta: '0',
      feePaid: '0',
      updatedAt:
        sortedEntries[sortedEntries.length - 1]?.createdAt ||
        getRFC3339Timestamp(),
    });

    let available = new BigNumber(0);
    let locked = new BigNumber(0);
    let initialDeposit = new BigNumber(0);
    let realizedDelta = new BigNumber(0);
    let feePaid = new BigNumber(0);

    for (const entry of sortedEntries) {
      const amount = new BigNumber(entry.amount);
      const reversedEntry = entry.reversalOf
        ? sortedEntries.find(
            (candidate) => candidate.entryId === entry.reversalOf,
          ) || null
        : null;

      if (entry.type === 'deposit_credit' || entry.type === 'reward_credit') {
        available = available.plus(amount);
      }

      if (entry.type === 'withdraw_debit' || entry.type === 'fee_debit') {
        available = available.plus(amount);
      }

      if (entry.type === 'reserve_lock') {
        available = available.minus(amount);
        locked = locked.plus(amount);
      }

      if (entry.type === 'reserve_release') {
        available = available.plus(amount);
        locked = locked.minus(amount);
      }

      if (entry.type === 'fill_settle') {
        if (amount.isNegative()) {
          locked = locked.plus(amount);
        } else {
          available = available.plus(amount);
        }
      }

      if (entry.type === 'reversal') {
        available = available.plus(amount);
      }

      if (entry.type === 'deposit_credit') {
        initialDeposit = initialDeposit.plus(amount);
      }

      if (
        entry.type === 'fill_settle' ||
        entry.type === 'reward_credit' ||
        (entry.type === 'reversal' &&
          this.shouldReversalAffectRealizedDelta(reversedEntry))
      ) {
        realizedDelta = realizedDelta.plus(amount);
      }

      if (entry.type === 'fee_debit') {
        feePaid = feePaid.plus(amount.abs());
      }

      if (entry.type === 'reversal' && reversedEntry?.type === 'fee_debit') {
        feePaid = BigNumber.maximum(feePaid.minus(amount.abs()), 0);
      }
    }

    balance.available = available.toFixed();
    balance.locked = locked.toFixed();
    balance.total = available.plus(locked).toFixed();
    balance.initialDeposit = initialDeposit.toFixed();
    balance.realizedDelta = realizedDelta.toFixed();
    balance.feePaid = feePaid.toFixed();

    return balance;
  }

  private buildIdempotencyContentHash(
    type: LedgerEntryType,
    command: BalanceLedgerCommand,
    signedAmount: string,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          orderId: command.orderId,
          userId: command.userId,
          assetId: command.assetId,
          amount: signedAmount,
          type,
          refType: command.refType || null,
          refId: command.refId || null,
          reversalOf: command.reversalOf || null,
        }),
      )
      .digest('hex');
  }

  private async assertIdempotencyPayloadMatches(
    existingEntry: LedgerEntry,
    type: LedgerEntryType,
    command: BalanceLedgerCommand,
  ): Promise<void> {
    const contentHash = this.buildIdempotencyContentHash(
      type,
      command,
      this.getSignedAmountForIdempotency(type, command.amount),
    );

    if (existingEntry.idempotencyContentHash !== contentHash) {
      await this.durabilityService?.appendOutboxEvent({
        topic: 'ledger.idempotency_conflict',
        aggregateType: 'ledger_entry',
        aggregateId: existingEntry.entryId,
        payload: {
          orderId: command.orderId,
          assetId: command.assetId,
          idempotencyKey: command.idempotencyKey,
          existingContentHash: existingEntry.idempotencyContentHash,
          attemptedContentHash: contentHash,
        },
      });
      throw new BadRequestException(
        'duplicate idempotency key has different ledger payload',
      );
    }
  }

  private getSignedAmountForIdempotency(
    type: LedgerEntryType,
    amount: string,
  ): string {
    const amountBn = new BigNumber(amount);

    if (type === 'withdraw_debit' || type === 'fee_debit') {
      return amountBn.negated().toFixed();
    }

    return amountBn.toFixed();
  }
}
