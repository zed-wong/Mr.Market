import { Module } from '@nestjs/common';

import { DexAdapterRegistry } from './adapter-registry';
import { PancakeV3Adapter } from './adapters/pancakeV3.adapter';
import { UniswapV3Adapter } from './adapters/uniswapV3.adapter';

@Module({
  providers: [DexAdapterRegistry, UniswapV3Adapter, PancakeV3Adapter],
  exports: [DexAdapterRegistry, UniswapV3Adapter, PancakeV3Adapter],
})
export class DefiModule {}
