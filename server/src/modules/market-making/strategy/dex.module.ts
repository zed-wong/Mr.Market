import { Module } from '@nestjs/common';
import { DexAdapterRegistry } from 'src/defi/adapter-registry';
import { PancakeV3Adapter } from 'src/defi/adapters/pancakeV3.adapter';
import { UniswapV3Adapter } from 'src/defi/adapters/uniswapV3.adapter';

import { Web3Module } from '../../web3/web3.module';
import { DexVolumeStrategyService } from './dex-volume.strategy.service';

@Module({
  imports: [Web3Module],
  providers: [
    UniswapV3Adapter,
    PancakeV3Adapter,
    DexAdapterRegistry,
    DexVolumeStrategyService,
  ],
  exports: [
    UniswapV3Adapter,
    PancakeV3Adapter,
    DexAdapterRegistry,
    DexVolumeStrategyService,
  ],
})
export class DexModule {}
