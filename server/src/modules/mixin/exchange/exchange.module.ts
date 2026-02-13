// exchange.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APIKeysConfig } from 'src/common/entities/admin/api-keys.entity';
import {
  MixinReleaseHistory,
  MixinReleaseToken,
} from 'src/common/entities/mixin/mixin-release.entity';
import { SpotOrder } from 'src/common/entities/orders/spot-order.entity';
import { ExchangeRepository } from 'src/modules/mixin/exchange/exchange.repository';
import { ExchangeService } from 'src/modules/mixin/exchange/exchange.service';

import { ExchangeController } from './exchange.controller';
import { ExchangeUserController } from './exchange-client.controller';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      APIKeysConfig,
      SpotOrder,
      MixinReleaseToken,
      MixinReleaseHistory,
    ]),
  ],
  providers: [ExchangeService, ExchangeRepository],
  exports: [ExchangeService, ExchangeRepository],
  controllers: [ExchangeController, ExchangeUserController],
})
export class ExchangeModule {}
