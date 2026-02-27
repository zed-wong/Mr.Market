import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GrowdataArbitragePair,
  GrowdataExchange,
  GrowdataMarketMakingPair,
  GrowdataSimplyGrowToken,
} from 'src/common/entities/data/grow-data.entity';
import { MixinClientModule } from 'src/modules/mixin/client/mixin-client.module';

import { GrowdataController } from './grow-data.controller';
import { GrowdataRepository } from './grow-data.repository';
import { GrowdataService } from './grow-data.service';

@Module({
  imports: [
    CacheModule.register(),
    MixinClientModule,
    TypeOrmModule.forFeature([
      GrowdataExchange,
      GrowdataSimplyGrowToken,
      GrowdataArbitragePair,
      GrowdataMarketMakingPair,
    ]),
  ],
  controllers: [GrowdataController],
  providers: [GrowdataService, GrowdataRepository],
  exports: [GrowdataService, CacheModule, GrowdataRepository],
})
export class GrowdataModule {}
