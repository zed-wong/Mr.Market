import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { Repository } from 'typeorm';

import { BalanceLedgerService } from './balance-ledger.service';

type LimitOrderReservationCommand = {
  orderId: string;
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
      userId: command.userId,
      assetId: reservation.assetId,
      amount: reservation.amount,
      idempotencyKey: `reserve:${command.intentId}`,
      refType: 'strategy_order_intent',
      refId: command.intentId,
    });

    return { ...reservation, applied: result.applied };
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

    const result = await this.balanceLedgerService.unlockFunds({
      orderId: command.orderId,
      userId: command.userId,
      assetId: reservation.assetId,
      amount: reservation.amount,
      idempotencyKey: `reserve-release:${
        command.releaseId || command.intentId
      }:${command.reason}`,
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

    try {
      reservation = this.calculateReservation(command);
    } catch {
      reservation = fallbackReservation;
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
    const releaseAmount =
      calculatedAmount.isFinite() && calculatedAmount.isGreaterThan(0)
        ? BigNumber.minimum(calculatedAmount, lockedAmount)
        : lockedAmount;

    if (releaseAmount.isLessThanOrEqualTo(0)) {
      return { ...reservation, amount: '0', applied: false };
    }

    const result = await this.balanceLedgerService.unlockFunds({
      orderId: command.orderId,
      userId: command.userId,
      assetId: reservation.assetId,
      amount: releaseAmount.toFixed(),
      idempotencyKey: `reserve-release:${
        command.releaseId || command.intentId
      }:${command.reason}`,
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
        idempotencyKey: `reservation-recovery:${candidate.orderId}:${candidate.assetId}`,
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
