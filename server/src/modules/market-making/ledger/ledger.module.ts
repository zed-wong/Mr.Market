import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';

import { DurabilityModule } from '../durability/durability.module';
import { BalanceLedgerService } from './balance-ledger.service';
import { OrderReservationService } from './order-reservation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LedgerEntry, MarketMakingOrderBalance]),
    DurabilityModule,
  ],
  providers: [BalanceLedgerService, OrderReservationService],
  exports: [BalanceLedgerService, OrderReservationService],
})
export class LedgerModule {}
