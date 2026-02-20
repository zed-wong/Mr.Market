import { Module } from '@nestjs/common';
import { MixinClientModule } from 'src/modules/mixin/client/mixin-client.module';

import { NetworkMappingService } from './network-mapping.service';

@Module({
  imports: [MixinClientModule],
  providers: [NetworkMappingService],
  exports: [NetworkMappingService],
})
export class NetworkMappingModule {}
