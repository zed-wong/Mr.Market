import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { RewardLedger } from 'src/common/entities/ledger/reward-ledger.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Web3Service } from 'src/modules/web3/web3.service';
import { Repository } from 'typeorm';

@Injectable()
export class RewardReceiverService {
  constructor(
    @InjectRepository(RewardLedger)
    private readonly rewardLedgerRepository: Repository<RewardLedger>,
    private readonly web3Service: Web3Service,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async confirmObservedRewardsCron(): Promise<void> {
    await this.confirmObservedRewards(1);
  }

  async confirmObservedRewards(chainId: number): Promise<void> {
    const rows = await this.rewardLedgerRepository.find({
      where: { status: 'OBSERVED' },
    });

    const signer = this.web3Service.getSigner(chainId);

    for (const row of rows) {
      const receipt = await signer.provider?.getTransactionReceipt(row.txHash);

      if (receipt?.status === 1) {
        row.status = 'CONFIRMED';
        row.confirmedAt = getRFC3339Timestamp();
        await this.rewardLedgerRepository.save(row);
      }
    }
  }
}
