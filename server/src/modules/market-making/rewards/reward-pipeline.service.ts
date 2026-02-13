import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { createHash } from 'crypto';
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

type ShareInput = {
  userId: string;
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
      campaignId: command.campaignId,
      dayIndex: command.dayIndex,
      status: 'OBSERVED',
      observedAt: getRFC3339Timestamp(),
    });

    return await this.rewardLedgerRepository.save(ledger);
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

    const totalShares = shares.reduce(
      (acc, item) => acc.plus(item.basisShares),
      new BigNumber(0),
    );

    if (totalShares.isLessThanOrEqualTo(0)) {
      return;
    }

    const rewardAmount = new BigNumber(reward.amount);
    const sortedShares = [...shares].sort((a, b) => {
      const left = new BigNumber(a.basisShares);
      const right = new BigNumber(b.basisShares);

      if (left.isEqualTo(right)) {
        return a.userId.localeCompare(b.userId);
      }

      return right.minus(left).toNumber();
    });

    const computed: Array<{
      userId: string;
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
        basisShares: share.basisShares,
        amount,
      });
    }

    const remainder = rewardAmount.minus(allocated);

    if (remainder.isGreaterThan(0) && computed.length > 0) {
      computed[0].amount = computed[0].amount.plus(remainder);
    }

    for (const row of computed) {
      const allocationId = this.buildAllocationId(
        reward.campaignId,
        reward.dayIndex,
        row.userId,
        reward.token,
      );
      const allocation = this.rewardAllocationRepository.create({
        allocationId,
        rewardTxHash: txHash,
        campaignId: reward.campaignId,
        dayIndex: reward.dayIndex,
        userId: row.userId,
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

      await this.balanceLedgerService.creditReward({
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
    campaignId: string,
    dayIndex: number,
    userId: string,
    token: string,
  ): string {
    return createHash('sha256')
      .update(`${campaignId}:${dayIndex}:${userId}:${token}`)
      .digest('hex');
  }
}
