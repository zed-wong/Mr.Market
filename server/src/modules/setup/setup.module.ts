import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';
import { SetupStateEntity } from 'src/common/entities/admin/setup-state.entity';
import {
  GrowdataExchange,
  GrowdataMarketMakingPair,
  GrowdataSimplyGrowToken,
} from 'src/common/entities/data/grow-data.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { SetupConfigModule } from 'src/modules/setup-config/setup-config.module';

import { AuthModule } from '../auth/auth.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
import { SetupGuardMiddleware } from './setup-guard.middleware';

@Module({
  imports: [
    AuthModule,
    SetupConfigModule,
    TypeOrmModule.forFeature([
      SetupStateEntity,
      GrowdataExchange,
      GrowdataMarketMakingPair,
      GrowdataSimplyGrowToken,
      CustomConfigEntity,
      StrategyDefinition,
    ]),
  ],
  controllers: [SetupController],
  providers: [SetupService, SetupGuardMiddleware],
  exports: [SetupService, SetupGuardMiddleware],
})
export class SetupModule {}
