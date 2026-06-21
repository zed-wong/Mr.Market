import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvmExecution } from 'src/common/entities/market-making/evm-execution.entity';

import { LedgerModule } from '../ledger/ledger.module';
import { TokenRegistryModule } from '../token-registry/token-registry.module';
import { TradingAccountModule } from '../trading-account/trading-account.module';
import { AmmSwapSettlementService } from './amm-swap-settlement.service';
import { EvmChildExecutionPlannerService } from './evm-child-execution-planner.service';
import { EvmExecutionReconciliationRunner } from './evm-execution-reconciliation-runner.service';
import { EvmExecutionService } from './evm-execution.service';
import { EvmReceiptConfirmerService } from './evm-receipt-confirmer.service';
import { GasPriceOracleService } from './gas-price-oracle.service';
import { NonceAllocatorService } from './nonce-allocator.service';
import { WalletBalanceReconciliationRunner } from './wallet-balance-reconciliation-runner.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EvmExecution]),
    TradingAccountModule,
    TokenRegistryModule,
    LedgerModule,
  ],
  providers: [
    AmmSwapSettlementService,
    EvmChildExecutionPlannerService,
    EvmExecutionReconciliationRunner,
    EvmExecutionService,
    EvmReceiptConfirmerService,
    GasPriceOracleService,
    NonceAllocatorService,
    WalletBalanceReconciliationRunner,
  ],
  exports: [
    AmmSwapSettlementService,
    EvmChildExecutionPlannerService,
    EvmExecutionReconciliationRunner,
    EvmExecutionService,
    EvmReceiptConfirmerService,
    GasPriceOracleService,
    NonceAllocatorService,
    WalletBalanceReconciliationRunner,
  ],
})
export class EvmExecutionModule {}
