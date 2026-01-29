import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ExchangeInitService } from './exchange-init.service';

@Global()
@Module({
  imports: [CacheModule.register()],
  providers: [ExchangeInitService],
  exports: [ExchangeInitService],
})
export class ExchangeInitModule {}
