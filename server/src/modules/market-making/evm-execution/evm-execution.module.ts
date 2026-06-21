import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvmExecution } from 'src/common/entities/market-making/evm-execution.entity';

import { TradingAccountModule } from '../trading-account/trading-account.module';
import { EvmExecutionService } from './evm-execution.service';
import { EvmReceiptConfirmerService } from './evm-receipt-confirmer.service';
import { GasPriceOracleService } from './gas-price-oracle.service';
import { NonceAllocatorService } from './nonce-allocator.service';

@Module({
  imports: [TypeOrmModule.forFeature([EvmExecution]), TradingAccountModule],
  providers: [
    EvmExecutionService,
    EvmReceiptConfirmerService,
    GasPriceOracleService,
    NonceAllocatorService,
  ],
  exports: [
    EvmExecutionService,
    EvmReceiptConfirmerService,
    GasPriceOracleService,
    NonceAllocatorService,
  ],
})
export class EvmExecutionModule {}
