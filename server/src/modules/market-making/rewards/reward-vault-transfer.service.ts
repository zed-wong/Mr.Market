import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { RewardLedger } from 'src/common/entities/ledger/reward-ledger.entity';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { TransactionService } from 'src/modules/mixin/transaction/transaction.service';
import { Repository } from 'typeorm';

import { DurabilityService } from '../durability/durability.service';

@Injectable()
export class RewardVaultTransferService {
  private readonly logger = new CustomLogger(RewardVaultTransferService.name);
  private readonly mixinVaultUserId?: string;

  constructor(
    @InjectRepository(RewardLedger)
    private readonly rewardLedgerRepository: Repository<RewardLedger>,
    private readonly transactionService: TransactionService,
    private readonly configService: ConfigService,
    private readonly durabilityService: DurabilityService,
  ) {
    this.mixinVaultUserId = this.configService.get<string>(
      'reward.mixin_vault_user_id',
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async transferConfirmedRewardsToMixinCron(): Promise<void> {
    await this.transferConfirmedRewardsToMixin();
  }

  async transferConfirmedRewardsToMixin(): Promise<number> {
    if (!this.mixinVaultUserId) {
      return 0;
    }

    const rows = await this.rewardLedgerRepository.find({
      where: { status: 'CONFIRMED' },
    });

    let transferredCount = 0;

    for (const row of rows) {
      const idempotencyKey = `reward-vault-transfer:${row.txHash}`;
      const claimResult = await this.rewardLedgerRepository.update(
        { txHash: row.txHash, status: 'CONFIRMED' },
        { status: 'TRANSFERRING_TO_MIXIN' },
      );

      if (!claimResult.affected) {
        continue;
      }

      try {
        const alreadyProcessed = await this.durabilityService.isProcessed(
          'reward-vault-transfer',
          idempotencyKey,
        );

        if (alreadyProcessed) {
          row.status = 'TRANSFERRED_TO_MIXIN';
          await this.rewardLedgerRepository.save(row);
          transferredCount += 1;
          continue;
        }

        const requests = await this.transactionService.transfer(
          this.mixinVaultUserId,
          row.token,
          row.amount,
          `reward-vault:${row.txHash}`,
        );

        if (!Array.isArray(requests) || requests.length === 0) {
          throw new Error('reward vault transfer returned no receipt');
        }

        const markedProcessed = await this.durabilityService.markProcessed(
          'reward-vault-transfer',
          idempotencyKey,
        );

        if (!markedProcessed) {
          throw new Error('reward vault transfer idempotency marker not written');
        }

        row.status = 'TRANSFERRED_TO_MIXIN';
        await this.rewardLedgerRepository.save(row);
        transferredCount += 1;
      } catch (error) {
        row.status = 'CONFIRMED';
        await this.rewardLedgerRepository.save(row);
        this.logger.error(
          `Failed reward vault transfer for ${row.txHash}: ${error.message}`,
        );
      }
    }

    return transferredCount;
  }
}
