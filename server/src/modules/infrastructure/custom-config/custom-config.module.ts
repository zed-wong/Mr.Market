import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';

import { CustomConfigRepository } from './custom-config.repository';
import { CustomConfigService } from './custom-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomConfigEntity])],
  providers: [CustomConfigService, CustomConfigRepository],
  exports: [CustomConfigService, CustomConfigRepository],
})
export class CustomConfigModule {}
