import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ExchangeInitService } from './exchange-init.service';
import { ExchangeModule } from 'src/modules/mixin/exchange/exchange.module';

@Global()
@Module({
  imports: [CacheModule.register(), ExchangeModule],
  providers: [ExchangeInitService],
  exports: [ExchangeInitService],
})
export class ExchangeInitModule {}
