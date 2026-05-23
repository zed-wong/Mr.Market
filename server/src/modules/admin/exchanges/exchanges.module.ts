import { Module } from '@nestjs/common';
import { AdminAuditModule } from 'src/modules/admin/system/admin-audit.module';
import { ExchangeModule } from 'src/modules/mixin/exchange/exchange.module';

import { AdminExchangesController } from './exchanges.controller';

@Module({
  imports: [ExchangeModule, AdminAuditModule],
  controllers: [AdminExchangesController],
})
export class AdminExchangesModule {}
