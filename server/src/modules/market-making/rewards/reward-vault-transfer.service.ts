import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { RewardLedger } from 'src/common/entities/ledger/reward-ledger.entity';
import { TransactionService } from 'src/modules/mixin/transaction/transaction.service';
import { Repository } from 'typeorm';

@Injectable()
export class RewardVaultTransferService {
  private readonly mixinVaultUserId?: string;

  constructor(
    @InjectRepository(RewardLedger)
    private readonly rewardLedgerRepository: Repository<RewardLedger>,
    private readonly transactionService: TransactionService,
    private readonly configService: ConfigService,
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
      await this.transactionService.transfer(
        this.mixinVaultUserId,
        row.token,
        row.amount,
        `reward-vault:${row.txHash}`,
      );
      row.status = 'TRANSFERRED_TO_MIXIN';
      await this.rewardLedgerRepository.save(row);
      transferredCount += 1;
    }

    return transferredCount;
  }
}
