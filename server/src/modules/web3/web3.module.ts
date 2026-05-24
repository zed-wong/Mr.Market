import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { Performance } from 'src/common/entities/market-making/performance.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { LedgerModule } from 'src/modules/market-making/ledger/ledger.module';
import { UserOrdersModule } from 'src/modules/market-making/user-orders/user-orders.module';

import { Web3MarketMakingController } from './market-making/web3-market-making.controller';
import { Web3MarketMakingService } from './market-making/web3-market-making.service';
import { Web3Service } from './web3.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketMakingOrderBalance,
      LedgerEntry,
      GrowdataMarketMakingPair,
      StrategyDefinition,
      Performance,
      StrategyExecutionHistory,
    ]),
    UserOrdersModule,
    LedgerModule,
  ],
  controllers: [Web3MarketMakingController],
  providers: [Web3Service, Web3MarketMakingService],
  exports: [Web3Service, Web3MarketMakingService],
})
export class Web3Module {}
