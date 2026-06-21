import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradingAccount } from 'src/common/entities/market-making/trading-account.entity';

import { TradingAccountService } from './trading-account.service';

@Module({
  imports: [TypeOrmModule.forFeature([TradingAccount])],
  providers: [TradingAccountService],
  exports: [TradingAccountService],
})
export class TradingAccountModule {}
