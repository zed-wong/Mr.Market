import { BullModule } from '@nestjs/bull';
import { InjectQueue } from '@nestjs/bull';
import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Queue } from 'bull';
import { Withdrawal } from 'src/common/entities/mixin/withdrawal.entity';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { LedgerModule } from 'src/modules/market-making/ledger/ledger.module';

import { MixinClientModule } from '../client/mixin-client.module';
import { WalletModule } from '../wallet/wallet.module';
import { WithdrawalProcessor } from './withdrawal.processor';
import { WithdrawalService } from './withdrawal.service';
import { WithdrawalConfirmationWorker } from './withdrawal-confirmation.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([Withdrawal]),
    BullModule.registerQueue(
      {
        name: 'withdrawals',
      },
      {
        name: 'withdrawal-confirmations',
      },
    ),
    MixinClientModule,
    WalletModule,
    LedgerModule,
    ConfigModule,
  ],
  providers: [
    WithdrawalService,
    WithdrawalProcessor,
    WithdrawalConfirmationWorker,
  ],
  exports: [WithdrawalService, BullModule],
})
export class WithdrawalModule implements OnApplicationBootstrap {
  private readonly logger = new CustomLogger(WithdrawalModule.name);
  private readonly enableConfirmationWorker: boolean;

  constructor(
    private configService: ConfigService,
    @InjectQueue('withdrawal-confirmations')
    private confirmationQueue: Queue,
  ) {
    this.enableConfirmationWorker =
      this.configService.get<string>(
        'strategy.mixin_withdrawal_confirmation_run',
      ) === 'true';
  }

  async onApplicationBootstrap() {
    if (this.enableConfirmationWorker) {
      this.logger.log('Starting withdrawal confirmation worker...');
      await this.confirmationQueue.add(
        'check_withdrawal_confirmations',
        {},
        {
          removeOnComplete: true,
        },
      );
    } else {
      this.logger.log('Withdrawal confirmation worker is disabled');
    }
  }
}
