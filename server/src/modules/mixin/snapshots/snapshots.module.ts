import { Module } from '@nestjs/common';
import { SnapshotsService } from './snapshots.service';
import { BullModule } from '@nestjs/bull';
import { SnapshotsProcessor } from './snapshots.processor';
import { MixinClientModule } from '../client/mixin-client.module';
import { TransactionModule } from '../transaction/transaction.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketMakingOrderIntent } from 'src/common/entities/market-making-order-intent.entity';

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
export class SnapshotsModule { }
