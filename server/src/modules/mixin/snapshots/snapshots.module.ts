import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketMakingOrderIntent } from 'src/common/entities/market-making/market-making-order-intent.entity';

import { MixinClientModule } from '../client/mixin-client.module';
import { TransactionModule } from '../transaction/transaction.module';
import { SnapshotsProcessor } from './snapshots.processor';
import { SnapshotsService } from './snapshots.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'snapshots',
    }),
    BullModule.registerQueue({
      name: 'market-making',
    }),
    TypeOrmModule.forFeature([MarketMakingOrderIntent]),
    MixinClientModule,
    TransactionModule,
  ],
  providers: [SnapshotsService, SnapshotsProcessor],
  exports: [SnapshotsService, BullModule],
})
export class SnapshotsModule {}
