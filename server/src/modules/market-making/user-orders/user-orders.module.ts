import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketMakingOrderIntent } from 'src/common/entities/market-making/market-making-order-intent.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { MarketMakingPaymentState } from 'src/common/entities/orders/payment-state.entity';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from 'src/common/entities/orders/user-orders.entity';
import { CampaignModule } from 'src/modules/campaign/campaign.module';
import { GrowdataModule } from 'src/modules/data/grow-data/grow-data.module';
import { MixinClientModule } from 'src/modules/mixin/client/mixin-client.module';
import { ExchangeModule } from 'src/modules/mixin/exchange/exchange.module';
import { SnapshotsModule } from 'src/modules/mixin/snapshots/snapshots.module';
import { TransactionModule } from 'src/modules/mixin/transaction/transaction.module';
import { WithdrawalModule } from 'src/modules/mixin/withdrawal/withdrawal.module';

import { FeeModule } from '../fee/fee.module';
import { LedgerModule } from '../ledger/ledger.module';
import { NetworkMappingModule } from '../network-mapping/network-mapping.module';
import { StrategyModule } from '../strategy/strategy.module';
import { MarketMakingOrderProcessor } from './market-making.processor';
import { MarketMakingRuntimeService } from './market-making-runtime.service';
import { UserOrdersController } from './user-orders.controller';
import { UserOrdersService } from './user-orders.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      MarketMakingOrder,
      MarketMakingPaymentState,
      MarketMakingOrderIntent,
      StrategyDefinition,
      SimplyGrowOrder,
      StrategyExecutionHistory,
    ]),
    BullModule.registerQueue({
      name: 'market-making',
    }),
    StrategyModule,
    FeeModule,
    GrowdataModule,
    SnapshotsModule,
    TransactionModule,
    WithdrawalModule,
    ExchangeModule,
    NetworkMappingModule,
    CampaignModule,
    MixinClientModule,
    LedgerModule,
  ],
  controllers: [UserOrdersController],
  providers: [
    UserOrdersService,
    MarketMakingRuntimeService,
    MarketMakingOrderProcessor,
  ],
  exports: [UserOrdersService, MarketMakingRuntimeService],
})
export class UserOrdersModule {}
