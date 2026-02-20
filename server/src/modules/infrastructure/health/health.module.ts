import { Module } from '@nestjs/common';

import { MixinModule } from '../../mixin/mixin.module';
import { ExchangeInitModule } from '../exchange-init/exchange-init.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [MixinModule, ExchangeInitModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
