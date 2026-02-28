// exchange.module.ts
import { Module } from '@nestjs/common';
import { ExchangeApiKeyModule } from 'src/modules/market-making/exchange-api-key/exchange-api-key.module';

import { ExchangeController } from './exchange.controller';
import { ExchangeUserController } from './exchange-client.controller';

@Module({
  imports: [ExchangeApiKeyModule],
  exports: [ExchangeApiKeyModule],
  controllers: [ExchangeController, ExchangeUserController],
})
export class ExchangeModule {}
