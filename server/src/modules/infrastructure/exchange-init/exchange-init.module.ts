import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ExchangeApiKeyModule } from 'src/modules/market-making/exchange-api-key/exchange-api-key.module';

import { ExchangeInitService } from './exchange-init.service';

@Global()
@Module({
  imports: [CacheModule.register(), ExchangeApiKeyModule],
  providers: [ExchangeInitService],
  exports: [ExchangeInitService],
})
export class ExchangeInitModule {}
