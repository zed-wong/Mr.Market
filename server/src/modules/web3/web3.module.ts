import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { MarketMakingLifecycleEvent } from 'src/common/entities/market-making/market-making-lifecycle-event.entity';
import { Performance } from 'src/common/entities/market-making/performance.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { Web3Withdrawal } from 'src/common/entities/web3/web3-withdrawal.entity';
import { LedgerModule } from 'src/modules/market-making/ledger/ledger.module';
import { PerformanceModule } from 'src/modules/market-making/performance/performance.module';
import { UserOrdersModule } from 'src/modules/market-making/user-orders/user-orders.module';

import { Web3BalancesController } from './balances/web3-balances.controller';
import { Web3BalancesService } from './balances/web3-balances.service';
import { Web3DepositController } from './deposit/web3-deposit.controller';
import { Web3DepositService } from './deposit/web3-deposit.service';
import { Web3MarketMakingController } from './market-making/web3-market-making.controller';
import { Web3MarketMakingService } from './market-making/web3-market-making.service';
import { Web3Service } from './web3.service';
import { Web3WithdrawController } from './withdraw/web3-withdraw.controller';
import { Web3WithdrawService } from './withdraw/web3-withdraw.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketMakingOrderBalance,
      LedgerEntry,
      GrowdataMarketMakingPair,
      StrategyDefinition,
      Performance,
      StrategyExecutionHistory,
      MarketMakingOrder,
      MarketMakingLifecycleEvent,
      Web3Withdrawal,
    ]),
    forwardRef(() => UserOrdersModule),
    LedgerModule,
    PerformanceModule,
  ],
  controllers: [
    Web3MarketMakingController,
    Web3DepositController,
    Web3BalancesController,
    Web3WithdrawController,
  ],
  providers: [
    Web3Service,
    Web3MarketMakingService,
    Web3DepositService,
    Web3BalancesService,
    Web3WithdrawService,
  ],
  exports: [
    Web3Service,
    Web3MarketMakingService,
    Web3DepositService,
    Web3BalancesService,
    Web3WithdrawService,
  ],
})
export class Web3Module {}
