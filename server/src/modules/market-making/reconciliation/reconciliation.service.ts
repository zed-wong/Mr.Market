import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { BalanceReadModel } from 'src/common/entities/ledger/balance-read-model.entity';
import { RewardAllocation } from 'src/common/entities/ledger/reward-allocation.entity';
import { RewardLedger } from 'src/common/entities/ledger/reward-ledger.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';

type ReconciliationReport = {
  checked: number;
  violations: number;
};

@Injectable()
export class ReconciliationService {
  private readonly logger = new CustomLogger(ReconciliationService.name);

  constructor(
    @InjectRepository(BalanceReadModel)
    private readonly balanceReadModelRepository: Repository<BalanceReadModel>,
    private readonly exchangeOrderTrackerService: ExchangeOrderTrackerService,
    @InjectRepository(RewardLedger)
    private readonly rewardLedgerRepository: Repository<RewardLedger>,
    @InjectRepository(RewardAllocation)
    private readonly rewardAllocationRepository: Repository<RewardAllocation>,
    @InjectRepository(StrategyOrderIntentEntity)
    private readonly strategyOrderIntentRepository: Repository<StrategyOrderIntentEntity>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runPeriodicReconciliation(): Promise<void> {
    const ledger = await this.reconcileLedgerInvariants();
    const rewards = await this.reconcileRewardConsistency();
    const intents = await this.reconcileIntentLifecycleConsistency();

    this.logger.log(
      `Ledger reconciliation checked=${ledger.checked} violations=${ledger.violations}; reward checked=${rewards.checked} violations=${rewards.violations}; intent checked=${intents.checked} violations=${intents.violations}`,
    );
  }

  async reconcileLedgerInvariants(): Promise<ReconciliationReport> {
    const rows = await this.balanceReadModelRepository.find();
    let violations = 0;

    for (const row of rows) {
      const available = new BigNumber(row.available);
      const locked = new BigNumber(row.locked);
      const total = new BigNumber(row.total);

      if (!available.plus(locked).isEqualTo(total)) {
        violations += 1;
      }

      if (available.isLessThan(0) || locked.isLessThan(0)) {
        violations += 1;
      }
    }

    return {
      checked: rows.length,
      violations,
    };
  }

  getOpenOrdersForStrategy(strategyKey: string) {
    return this.exchangeOrderTrackerService.getOpenOrders(strategyKey);
  }

  async reconcileRewardConsistency(): Promise<ReconciliationReport> {
    const rewards = await this.rewardLedgerRepository.find();
    const allocations = await this.rewardAllocationRepository.find();

    let violations = 0;

    for (const reward of rewards) {
      const rewardAmount = new BigNumber(reward.amount);
      const allocated = allocations
        .filter((allocation) => allocation.rewardTxHash === reward.txHash)
        .reduce(
          (acc, allocation) => acc.plus(allocation.amount),
          new BigNumber(0),
        );

      if (allocated.isGreaterThan(rewardAmount)) {
        violations += 1;
      }
    }

    return {
      checked: rewards.length,
      violations,
    };
  }

  async reconcileIntentLifecycleConsistency(): Promise<ReconciliationReport> {
    const intents = await this.strategyOrderIntentRepository.find();
    let violations = 0;
    const now = Date.now();

    for (const intent of intents) {
      if (
        intent.type === 'CREATE_LIMIT_ORDER' &&
        intent.status === 'DONE' &&
        !intent.mixinOrderId
      ) {
        violations += 1;
      }

      if (intent.status === 'SENT') {
        const ageMs = now - Date.parse(intent.updatedAt || intent.createdAt);

        if (Number.isFinite(ageMs) && ageMs > 5 * 60 * 1000) {
          violations += 1;
        }
      }
    }

    return {
      checked: intents.length,
      violations,
    };
  }
}
