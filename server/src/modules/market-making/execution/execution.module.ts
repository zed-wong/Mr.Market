import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ExchangeConnectorAdapterService } from './exchange-connector-adapter.service';

@Module({
  imports: [ConfigModule],
  providers: [ExchangeConnectorAdapterService],
  exports: [ExchangeConnectorAdapterService],
})
export class ExecutionModule {}
