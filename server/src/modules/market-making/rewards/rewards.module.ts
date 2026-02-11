import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardAllocation } from 'src/common/entities/reward-allocation.entity';
import { RewardLedger } from 'src/common/entities/reward-ledger.entity';
import { ShareLedgerEntry } from 'src/common/entities/share-ledger-entry.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { RewardPipelineService } from './reward-pipeline.service';
import { ShareLedgerService } from './share-ledger.service';
import { RewardReceiverService } from './reward-receiver.service';
import { RewardVaultTransferService } from './reward-vault-transfer.service';
import { Web3Module } from 'src/modules/web3/web3.module';
import { TransactionModule } from 'src/modules/mixin/transaction/transaction.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RewardLedger, RewardAllocation, ShareLedgerEntry]),
    LedgerModule,
    Web3Module,
    TransactionModule,
  ],
  providers: [
    RewardPipelineService,
    ShareLedgerService,
    RewardReceiverService,
    RewardVaultTransferService,
  ],
  exports: [RewardPipelineService, ShareLedgerService],
})
export class RewardsModule {}
