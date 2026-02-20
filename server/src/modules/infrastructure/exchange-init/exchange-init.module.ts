import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ExchangeModule } from 'src/modules/mixin/exchange/exchange.module';

import { ExchangeInitService } from './exchange-init.service';

@Global()
@Module({
  imports: [CacheModule.register(), ExchangeModule],
  providers: [ExchangeInitService],
  exports: [ExchangeInitService],
})
export class ExchangeInitModule {}
