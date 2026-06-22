import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderLpPosition } from 'src/common/entities/market-making/order-lp-position.entity';

import { EvmExecutionModule } from '../evm-execution/evm-execution.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TokenRegistryModule } from '../token-registry/token-registry.module';
import { LpPositionReconciliationRunner } from './lp-position-reconciliation-runner.service';
import { LpSettlementService } from './lp-settlement.service';
import { OrderLpPositionService } from './order-lp-position.service';
import { PoolStateTrackerService } from './pool-state-tracker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderLpPosition]),
    EvmExecutionModule,
    LedgerModule,
    TokenRegistryModule,
  ],
  providers: [
    OrderLpPositionService,
    PoolStateTrackerService,
    LpPositionReconciliationRunner,
    LpSettlementService,
  ],
  exports: [
    OrderLpPositionService,
    PoolStateTrackerService,
    LpPositionReconciliationRunner,
    LpSettlementService,
  ],
})
export class LpModule {}
