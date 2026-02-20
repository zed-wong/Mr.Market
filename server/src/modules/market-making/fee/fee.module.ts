import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GrowdataModule } from 'src/modules/data/grow-data/grow-data.module';

import { CustomConfigModule } from '../../infrastructure/custom-config/custom-config.module';
import { ExchangeInitModule } from '../../infrastructure/exchange-init/exchange-init.module';
import { MixinClientModule } from '../../mixin/client/mixin-client.module';
import { FeeController } from './fee.controller';
import { FeeService } from './fee.service';

@Module({
  imports: [
    ConfigModule,
    ExchangeInitModule,
    MixinClientModule,
    CustomConfigModule,
    GrowdataModule,
  ],
  controllers: [FeeController],
  providers: [FeeService],
  exports: [FeeService],
})
export class FeeModule {}
