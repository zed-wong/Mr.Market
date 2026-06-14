import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { createHash } from 'crypto';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { Repository } from 'typeorm';

import {
  BalanceLedgerService,
  ReservationPauseMetadata,
} from './balance-ledger.service';

type LimitOrderReservationCommand = {
  orderId: string;
  userOrderId?: string;
  accountLabel?: string;
  userId: string;
  intentId: string;
  pair: string;
  side: 'buy' | 'sell';
  price: string;
  qty: string;
};

export type OrderReservationResult = {
  orderId: string;
  assetId: string;
  amount: string;
  applied: boolean;
};

export type ReservationRecoveryCandidate = {
  orderId: string;
  userId: string;
  assetId: string;
  amount: string;
  liveIntentIds: string[];
};

@Injectable()
export class OrderReservationService {
  constructor(
    private readonly balanceLedgerService: BalanceLedgerService,
    @Optional()
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository?: Repository<LedgerEntry>,
  ) {}

  async reserveForLimitOrder(
    command: LimitOrderReservationCommand,
  ): Promise<OrderReservationResult> {
    const reservation = this.calculateReservation(command);
    const result = await this.balanceLedgerService.lockFunds({
      orderId: command.orderId,
      userOrderId: command.userOrderId,
      accountLabel: command.accountLabel,
      userId: command.userId,
      assetId: reservation.assetId,
      amount: reservation.amount,
      idempotencyKey: `reserve:${command.intentId}`,
      refType: 'strategy_order_intent',
      refId: command.intentId,
    });

    return { ...reservation, applied: result.applied };
  }

  isReservationPausedForLimitOrder(
    command: LimitOrderReservationCommand,
  ): boolean {
    const reservation = this.calculateReservation(command);

    return this.balanceLedgerService.isReservationPaused(
      command.orderId,
      reservation.assetId,
    );
  }

  pauseReservationForLimitOrder(
    command: LimitOrderReservationCommand,
    metadata: ReservationPauseMetadata = {},
  ): void {
    const reservation = this.calculateReservation(command);

    this.balanceLedgerService.pauseReservations(
      command.orderId,
      reservation.assetId,
      metadata,
    );
  }

  async releaseLimitOrderReservation(
    command: LimitOrderReservationCommand & {
      reason: string;
      releaseId?: string;
      filledQty?: string | null;
    },
  ): Promise<OrderReservationResult> {
    const reservation = this.calculateReservation(command);

    if (new BigNumber(reservation.amount).isLessThanOrEqualTo(0)) {
      return { ...reservation, applied: false };
    }

    const idempotencyKey = this.buildReservationReleaseIdempotencyKey(command);
    const existingRelease = await this.findExistingLedgerEntry(idempotencyKey);

    if (existingRelease) {
      return {
        ...reservation,
        amount: existingRelease.amount,
        applied: false,
      };
    }

    const result = await this.balanceLedgerService.unlockFunds({
      orderId: command.orderId,
      userOrderId: command.userOrderId,
      accountLabel: command.accountLabel,
      userId: command.userId,
      assetId: reservation.assetId,
      amount: reservation.amount,
      idempotencyKey,
      refType: command.reason,
      refId: command.releaseId || command.intentId,
    });

    return { ...reservation, applied: result.applied };
  }

  async releaseRemainingLimitOrderReservation(
    command: LimitOrderReservationCommand & {
      reason: string;
      releaseId?: string;
      filledQty?: string | null;
    },
  ): Promise<OrderReservationResult> {
    const fallbackReservation = this.resolveReservationAsset(command);
    let reservation: Omit<OrderReservationResult, 'applied'>;
    const normalizedCommand = this.normalizeTerminalReleaseCommand(command);

    try {
      reservation = this.calculateReservation(normalizedCommand);
    } catch {
      reservation = fallbackReservation;
    }

    const idempotencyKey = this.buildReservationReleaseIdempotencyKey(command);
    const existingRelease = await this.findExistingLedgerEntry(idempotencyKey);

    if (existingRelease) {
      return {
        ...reservation,
        amount: existingRelease.amount,
        applied: false,
      };
    }

    const existingBalance = await this.balanceLedgerService.getExistingBalance(
      command.orderId,
      reservation.assetId,
    );
    const lockedAmount = new BigNumber(existingBalance?.locked || 0);

    if (!lockedAmount.isFinite() || lockedAmount.isLessThanOrEqualTo(0)) {
      return { ...reservation, amount: '0', applied: false };
    }

    const calculatedAmount = new BigNumber(reservation.amount);

    if (
      normalizedCommand.reason === 'exchange_order_filled' &&
      calculatedAmount.isFinite() &&
      calculatedAmount.isLessThanOrEqualTo(0)
    ) {
      return { ...reservation, amount: '0', applied: false };
    }

    const releaseAmount =
      calculatedAmount.isFinite() && calculatedAmount.isGreaterThan(0)
        ? BigNumber.minimum(calculatedAmount, lockedAmount)
        : lockedAmount;

    if (releaseAmount.isLessThanOrEqualTo(0)) {
      return { ...reservation, amount: '0', applied: false };
    }

    const result = await this.balanceLedgerService.unlockFunds({
      orderId: command.orderId,
      userOrderId: command.userOrderId,
      accountLabel: command.accountLabel,
      userId: command.userId,
      assetId: reservation.assetId,
      amount: releaseAmount.toFixed(),
      idempotencyKey,
      refType: command.reason,
      refId: command.releaseId || command.intentId,
    });

    return {
      ...reservation,
      amount: releaseAmount.toFixed(),
      applied: result.applied,
    };
  }

  async recoverDanglingReservations(params: {
    liveIntentIds: string[];
    openOrderIds: string[];
    dryRun?: boolean;
  }): Promise<ReservationRecoveryCandidate[]> {
    if (!this.ledgerEntryRepository) {
      return [];
    }

    const entries = await this.ledgerEntryRepository.find();
    const activeReservations = this.buildActiveReservationCandidates(entries);
    const liveIntentIds = new Set(params.liveIntentIds);
    const openOrderIds = new Set(params.openOrderIds);
    const dangling = activeReservations.filter(
      (candidate) =>
        !openOrderIds.has(candidate.orderId) &&
        !candidate.liveIntentIds.some((intentId) =>
          liveIntentIds.has(intentId),
        ),
    );

    if (params.dryRun) {
      return dangling;
    }

    for (const candidate of dangling) {
      await this.balanceLedgerService.unlockFunds({
        orderId: candidate.orderId,
        userId: candidate.userId,
        assetId: candidate.assetId,
        amount: candidate.amount,
        idempotencyKey: this.buildReservationRecoveryIdempotencyKey(candidate),
        refType: 'reservation_recovery',
        refId: candidate.orderId,
      });
    }

    return dangling;
  }

  async recoverDanglingReservationsForOrder(params: {
    orderId: string;
    liveIntentIds: string[];
    hasOpenOrder: boolean;
    dryRun?: boolean;
  }): Promise<ReservationRecoveryCandidate[]> {
    if (!this.ledgerEntryRepository || !params.orderId || params.hasOpenOrder) {
      return [];
    }

    const entries = await this.ledgerEntryRepository.find({
      where: { orderId: params.orderId },
    });
    const activeReservations = this.buildActiveReservationCandidates(entries);
    const liveIntentIds = new Set(params.liveIntentIds);
    const dangling = activeReservations.filter(
      (candidate) =>
        !candidate.liveIntentIds.some((intentId) =>
          liveIntentIds.has(intentId),
        ),
    );

    if (params.dryRun) {
      return dangling;
    }

    for (const candidate of dangling) {
      await this.balanceLedgerService.unlockFunds({
        orderId: candidate.orderId,
        userId: candidate.userId,
        assetId: candidate.assetId,
        amount: candidate.amount,
        idempotencyKey: this.buildReservationRecoveryIdempotencyKey(candidate),
        refType: 'reservation_recovery',
        refId: candidate.orderId,
      });
    }

    return dangling;
  }

  private resolveReservationAsset(
    command: LimitOrderReservationCommand,
  ): Omit<OrderReservationResult, 'applied'> {
    const [baseAssetId, quoteAssetId] = command.pair.split('/');

    if (!baseAssetId || !quoteAssetId) {
      throw new Error(`Cannot reserve funds for invalid pair ${command.pair}`);
    }

    return {
      orderId: command.orderId,
      assetId: command.side === 'sell' ? baseAssetId : quoteAssetId,
      amount: '0',
    };
  }

  private normalizeTerminalReleaseCommand<
    T extends LimitOrderReservationCommand & {
      reason?: string;
      filledQty?: string | null;
    },
  >(command: T): T {
    if (command.reason !== 'exchange_order_filled') {
      return command;
    }

    const filledQty = new BigNumber(command.filledQty || 0);

    if (filledQty.isFinite() && filledQty.isGreaterThan(0)) {
      return command;
    }

    return {
      ...command,
      filledQty: command.qty,
    };
  }

  private buildReservationReleaseIdempotencyKey(
    command: Pick<LimitOrderReservationCommand, 'orderId' | 'intentId'> & {
      reason: string;
      releaseId?: string;
    },
  ): string {
    return `reserve-release:${command.orderId}:${
      command.releaseId || command.intentId
    }:${command.reason}`;
  }

  private buildReservationRecoveryIdempotencyKey(
    candidate: ReservationRecoveryCandidate,
  ): string {
    const contentHash = createHash('sha256')
      .update(
        JSON.stringify({
          orderId: candidate.orderId,
          assetId: candidate.assetId,
          amount: new BigNumber(candidate.amount).toFixed(),
          liveIntentIds: [...candidate.liveIntentIds].sort(),
        }),
      )
      .digest('hex')
      .slice(0, 16);

    return `reservation-recovery:${candidate.orderId}:${candidate.assetId}:${contentHash}`;
  }

  private async findExistingLedgerEntry(
    idempotencyKey: string,
  ): Promise<LedgerEntry | null> {
    if (!this.ledgerEntryRepository) {
      return null;
    }

    return await this.ledgerEntryRepository.findOneBy({ idempotencyKey });
  }

  private calculateReservation(
    command: LimitOrderReservationCommand & { filledQty?: string | null },
  ): Omit<OrderReservationResult, 'applied'> {
    const reservationAsset = this.resolveReservationAsset(command);

    const qty = new BigNumber(command.qty);
    const filledQty = new BigNumber(command.filledQty || 0);
    const price = new BigNumber(command.price);

    if (!qty.isFinite() || qty.isLessThanOrEqualTo(0)) {
      throw new Error('Cannot reserve funds for invalid order quantity');
    }

    if (!filledQty.isFinite() || filledQty.isLessThan(0)) {
      throw new Error('Cannot reserve funds for invalid filled quantity');
    }

    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      throw new Error('Cannot reserve funds for invalid order price');
    }

    const remainingQty = BigNumber.maximum(qty.minus(filledQty), 0);

    if (command.side === 'sell') {
      return {
        orderId: command.orderId,
        assetId: reservationAsset.assetId,
        amount: remainingQty.toFixed(),
      };
    }

    return {
      orderId: command.orderId,
      assetId: reservationAsset.assetId,
      amount: remainingQty.multipliedBy(price).toFixed(),
    };
  }

  private buildActiveReservationCandidates(
    entries: LedgerEntry[],
  ): ReservationRecoveryCandidate[] {
    const candidates = new Map<
      string,
      {
        orderId: string;
        userId: string;
        assetId: string;
        amount: BigNumber;
        liveIntentIds: Set<string>;
      }
    >();

    for (const entry of entries) {
      if (
        entry.type !== 'reserve_lock' &&
        entry.type !== 'reserve_release' &&
        entry.type !== 'fill_settle'
      ) {
        continue;
      }

      const key = `${entry.orderId}:${entry.assetId}`;
      const candidate = candidates.get(key) || {
        orderId: entry.orderId,
        userId: entry.userId,
        assetId: entry.assetId,
        amount: new BigNumber(0),
        liveIntentIds: new Set<string>(),
      };
      const amount = new BigNumber(entry.amount);

      if (entry.type === 'reserve_lock') {
        candidate.amount = candidate.amount.plus(amount);
        if (entry.refId) {
          candidate.liveIntentIds.add(entry.refId);
        }
      }

      if (entry.type === 'reserve_release') {
        candidate.amount = candidate.amount.minus(amount);
      }

      if (entry.type === 'fill_settle' && amount.isNegative()) {
        candidate.amount = candidate.amount.minus(amount.abs());
      }

      candidates.set(key, candidate);
    }

    return [...candidates.values()]
      .filter((candidate) => candidate.amount.isGreaterThan(0))
      .map((candidate) => ({
        orderId: candidate.orderId,
        userId: candidate.userId,
        assetId: candidate.assetId,
        amount: candidate.amount.toFixed(),
        liveIntentIds: [...candidate.liveIntentIds],
      }));
  }
}
