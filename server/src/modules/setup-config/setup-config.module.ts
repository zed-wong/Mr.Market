import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SetupConfigEntity } from 'src/common/entities/admin/setup-config.entity';

import { SetupConfigService } from './setup-config.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([SetupConfigEntity])],
  providers: [SetupConfigService],
  exports: [SetupConfigService],
})
export class SetupConfigModule {}
