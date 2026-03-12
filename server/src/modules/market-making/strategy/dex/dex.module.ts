import { Module } from '@nestjs/common';
import { DefiModule } from 'src/modules/defi/defi.module';

import { Web3Module } from '../../../web3/web3.module';
import { DexVolumeStrategyService } from './dex-volume.strategy.service';

@Module({
  imports: [Web3Module, DefiModule],
  providers: [DexVolumeStrategyService],
  exports: [DefiModule, DexVolumeStrategyService],
})
export class DexModule {}
