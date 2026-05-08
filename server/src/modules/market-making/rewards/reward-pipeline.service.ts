import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { createHash } from 'crypto';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { RewardAllocation } from 'src/common/entities/ledger/reward-allocation.entity';
import { RewardLedger } from 'src/common/entities/ledger/reward-ledger.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Repository } from 'typeorm';

import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { ShareLedgerService } from './share-ledger.service';

type ObserveRewardCommand = {
  txHash: string;
  token: string;
  amount: string;
  campaignId: string;
  dayIndex: number;
};

type ObserveRewardCorrectionCommand = {
  originalTxHash: string;
  correctionTxHash: string;
  correctedAmount: string;
};

type ShareInput = {
  userId: string;
  orderId: string;
  basisShares: string;
};

const REWARD_DECIMAL_PLACES = 8;

@Injectable()
export class RewardPipelineService {
  constructor(
    @InjectRepository(RewardLedger)
    private readonly rewardLedgerRepository: Repository<RewardLedger>,
    @InjectRepository(RewardAllocation)
    private readonly rewardAllocationRepository: Repository<RewardAllocation>,
    private readonly balanceLedgerService: BalanceLedgerService,
    private readonly shareLedgerService: ShareLedgerService,
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository?: Repository<LedgerEntry>,
  ) {}

  async observeReward(command: ObserveRewardCommand): Promise<RewardLedger> {
    const existing = await this.rewardLedgerRepository.findOneBy({
      txHash: command.txHash,
    });

    if (existing) {
      return existing;
    }

    const ledger = this.rewardLedgerRepository.create({
      txHash: command.txHash,
      token: command.token,
      amount: command.amount,
      platformFee: '0',
      undistributedRemainder: '0',
      campaignId: command.campaignId,
      dayIndex: command.dayIndex,
      status: 'OBSERVED',
      observedAt: getRFC3339Timestamp(),
    });

    return await this.rewardLedgerRepository.save(ledger);
  }

  async observeRewardCorrection(
    command: ObserveRewardCorrectionCommand,
  ): Promise<RewardLedger | null> {
    const original = await this.rewardLedgerRepository.findOneBy({
      txHash: command.originalTxHash,
    });

    if (!original) {
      return null;
    }

    const existing = await this.rewardLedgerRepository.findOneBy({
      txHash: command.correctionTxHash,
    });

    if (existing) {
      return existing;
    }

    const cumulativeObserved = await this.getCumulativeRewardAmount(original);
    const delta = new BigNumber(command.correctedAmount).minus(
      cumulativeObserved,
    );

    if (!delta.isFinite() || delta.isZero()) {
      return null;
    }

    const now = getRFC3339Timestamp();
    const correction = this.rewardLedgerRepository.create({
      txHash: command.correctionTxHash,
      token: original.token,
      amount: delta.toFixed(),
      platformFee: '0',
      undistributedRemainder: '0',
      campaignId: original.campaignId,
      dayIndex: original.dayIndex,
      status: 'CONFIRMED',
      observedAt: now,
      correctionOf: original.txHash,
      confirmedAt: now,
    });

    return await this.rewardLedgerRepository.save(correction);
  }

  async confirmReward(txHash: string): Promise<void> {
    const reward = await this.rewardLedgerRepository.findOneBy({ txHash });

    if (!reward) {
      return;
    }
    reward.status = 'CONFIRMED';
    reward.confirmedAt = getRFC3339Timestamp();
    await this.rewardLedgerRepository.save(reward);
  }

  async createAllocations(txHash: string, shares: ShareInput[]): Promise<void> {
    const reward = await this.rewardLedgerRepository.findOneBy({ txHash });

    if (!reward) {
      return;
    }

    const existingAllocations = await this.rewardAllocationRepository.find({
      where: { rewardTxHash: txHash },
    });

    if (existingAllocations.length > 0) {
      return;
    }

    const grossAmount = new BigNumber(reward.amount);
    const platformFee = grossAmount.isGreaterThan(0)
      ? BigNumber.min(
          BigNumber.max(new BigNumber(reward.platformFee || 0), 0),
          grossAmount,
        )
      : new BigNumber(0);
    const attributableShares = shares.filter((share) => share.orderId);
    const totalShares = attributableShares.reduce(
      (acc, item) => acc.plus(item.basisShares),
      new BigNumber(0),
    );
    const rewardAmount = grossAmount.minus(platformFee);

    if (totalShares.isLessThanOrEqualTo(0)) {
      reward.platformFee = platformFee.toFixed();
      reward.undistributedRemainder = rewardAmount.toFixed();
      await this.rewardLedgerRepository.save(reward);

      return;
    }

    const sortedShares = [...attributableShares].sort((a, b) => {
      const left = new BigNumber(a.basisShares);
      const right = new BigNumber(b.basisShares);

      if (left.isEqualTo(right)) {
        return `${a.userId}:${a.orderId}`.localeCompare(
          `${b.userId}:${b.orderId}`,
        );
      }

      return right.minus(left).toNumber();
    });

    const computed: Array<{
      userId: string;
      orderId: string;
      basisShares: string;
      amount: BigNumber;
    }> = [];
    let allocated = new BigNumber(0);

    for (const share of sortedShares) {
      const ratio = new BigNumber(share.basisShares).dividedBy(totalShares);
      const amount = rewardAmount
        .multipliedBy(ratio)
        .decimalPlaces(REWARD_DECIMAL_PLACES, BigNumber.ROUND_DOWN);

      allocated = allocated.plus(amount);
      computed.push({
        userId: share.userId,
        orderId: share.orderId,
        basisShares: share.basisShares,
        amount,
      });
    }

    const remainder = rewardAmount.minus(allocated);

    if (remainder.isGreaterThan(0) && computed.length > 0) {
      computed[0].amount = computed[0].amount.plus(remainder);
    }

    reward.platformFee = platformFee.toFixed();
    reward.undistributedRemainder = '0';
    await this.rewardLedgerRepository.save(reward);

    for (const row of computed) {
      const allocationId = this.buildAllocationId(
        txHash,
        reward.campaignId,
        reward.dayIndex,
        row.userId,
        row.orderId,
        reward.token,
      );
      const allocation = this.rewardAllocationRepository.create({
        allocationId,
        rewardTxHash: txHash,
        campaignId: reward.campaignId,
        dayIndex: reward.dayIndex,
        userId: row.userId,
        orderId: row.orderId,
        token: reward.token,
        amount: row.amount.toFixed(),
        basisShares: row.basisShares,
        status: 'CREATED',
        createdAt: getRFC3339Timestamp(),
      });

      await this.rewardAllocationRepository.save(allocation);
    }
  }

  async createAllocationsFromShareLedger(
    txHash: string,
    windowStart: string,
    windowEnd: string,
  ): Promise<void> {
    const shares = await this.shareLedgerService.computeTimeWeightedShares(
      windowStart,
      windowEnd,
    );

    await this.createAllocations(
      txHash,
      shares.map((share) => ({
        ...share,
        orderId: '',
      })),
    );
  }

  async createAllocationsFromEligibleFills(
    txHash: string,
    quoteAsset: string,
    windowStart: string,
    windowEnd: string,
  ): Promise<void> {
    if (!this.ledgerEntryRepository) {
      await this.createAllocations(txHash, []);

      return;
    }

    const quoteAssetKey = String(quoteAsset || '').trim();

    if (!quoteAssetKey) {
      await this.createAllocations(txHash, []);

      return;
    }

    const fillEntries = await this.ledgerEntryRepository.find({
      where: {
        type: 'fill_settle',
        refType: 'market_making_fill',
      },
    });
    const windowStartMs = Date.parse(windowStart);
    const windowEndMs = Date.parse(windowEnd);
    const sharesByUserOrder = new Map<
      string,
      { userId: string; orderId: string; basisShares: BigNumber }
    >();

    for (const entry of fillEntries) {
      if (!this.isEligibleFillScoreEntry(entry, quoteAssetKey)) {
        continue;
      }

      const createdAtMs = Date.parse(entry.createdAt);

      if (
        !Number.isFinite(createdAtMs) ||
        createdAtMs < windowStartMs ||
        createdAtMs >= windowEndMs
      ) {
        continue;
      }

      const amount = new BigNumber(entry.amount).abs();

      const shareKey = `${entry.userId}:${entry.orderId}`;
      const existing = sharesByUserOrder.get(shareKey);

      sharesByUserOrder.set(shareKey, {
        userId: entry.userId,
        orderId: entry.orderId,
        basisShares: (existing?.basisShares || new BigNumber(0)).plus(amount),
      });
    }

    const shares = [...sharesByUserOrder.values()].map((share) => ({
      userId: share.userId,
      orderId: share.orderId,
      basisShares: share.basisShares.toFixed(),
    }));

    await this.createAllocations(txHash, shares);
  }

  async distributeAllocations(txHash: string): Promise<void> {
    const allocations = await this.rewardAllocationRepository.find({
      where: { rewardTxHash: txHash },
    });

    for (const allocation of allocations) {
      if (allocation.status === 'CREDITED') {
        continue;
      }

      if (!allocation.orderId) {
        throw new Error(
          `Reward allocation ${allocation.allocationId} is missing orderId`,
        );
      }

      await this.balanceLedgerService.creditReward({
        orderId: allocation.orderId,
        userId: allocation.userId,
        assetId: allocation.token,
        amount: allocation.amount,
        idempotencyKey: `reward:${allocation.allocationId}`,
        refType: 'reward_allocation',
        refId: allocation.allocationId,
      });

      allocation.status = 'CREDITED';
      await this.rewardAllocationRepository.save(allocation);
    }

    const reward = await this.rewardLedgerRepository.findOneBy({ txHash });

    if (!reward) {
      return;
    }

    reward.status = 'DISTRIBUTED';
    reward.distributedAt = getRFC3339Timestamp();
    await this.rewardLedgerRepository.save(reward);
  }

  private buildAllocationId(
    txHash: string,
    campaignId: string,
    dayIndex: number,
    userId: string,
    orderId: string,
    token: string,
  ): string {
    return createHash('sha256')
      .update(
        `${txHash}:${campaignId}:${dayIndex}:${userId}:${orderId}:${token}`,
      )
      .digest('hex');
  }

  private async getCumulativeRewardAmount(
    original: RewardLedger,
  ): Promise<BigNumber> {
    if (typeof this.rewardLedgerRepository.find !== 'function') {
      return new BigNumber(original.amount);
    }

    const rewards = await this.rewardLedgerRepository.find();

    return rewards
      .filter(
        (reward) =>
          reward.txHash === original.txHash ||
          reward.correctionOf === original.txHash,
      )
      .reduce((total, reward) => total.plus(reward.amount), new BigNumber(0));
  }

  private isEligibleFillScoreEntry(
    entry: LedgerEntry,
    quoteAsset: string,
  ): boolean {
    if (
      !entry.orderId ||
      !entry.userId ||
      !entry.refId ||
      entry.assetId !== quoteAsset
    ) {
      return false;
    }

    const amount = new BigNumber(entry.amount);

    return amount.isFinite() && !amount.isZero();
  }
}
