import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenRegistryEntry } from 'src/common/entities/market-making/token-registry-entry.entity';

import { TokenRegistryService } from './token-registry.service';

@Module({
  imports: [TypeOrmModule.forFeature([TokenRegistryEntry])],
  providers: [TokenRegistryService],
  exports: [TokenRegistryService],
})
export class TokenRegistryModule {}
