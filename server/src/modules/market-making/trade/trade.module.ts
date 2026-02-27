import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trade } from 'src/common/entities/orders/trade.entity';

import { TradeController } from './trade.controller';
import { TradeRepository } from './trade.repository';
import { TradeService } from './trade.service';
@Module({
  imports: [TypeOrmModule.forFeature([Trade])],
  controllers: [TradeController],
  providers: [TradeService, TradeRepository],
  exports: [TradeService, TradeRepository],
})
export class TradeModule {}
