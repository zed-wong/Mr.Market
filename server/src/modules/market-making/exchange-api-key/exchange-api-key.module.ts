import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APIKeysConfig } from 'src/common/entities/admin/api-keys.entity';
import {
  MixinReleaseHistory,
  MixinReleaseToken,
} from 'src/common/entities/mixin/mixin-release.entity';
import { SpotOrder } from 'src/common/entities/orders/spot-order.entity';

import { ExchangeApiKeyRepository } from './exchange-api-key.repository';
import { ExchangeApiKeyService } from './exchange-api-key.service';

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
  providers: [ExchangeApiKeyService, ExchangeApiKeyRepository],
  exports: [ExchangeApiKeyService, ExchangeApiKeyRepository],
})
export class ExchangeApiKeyModule {}
