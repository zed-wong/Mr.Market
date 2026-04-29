import { BadRequestException, Injectable } from '@nestjs/common';
import type { DexId } from 'src/common/constants/defi-addresses';

import type { DexAdapter } from './adapters/dex-adapter';
import { PancakeV3Adapter } from './adapters/pancakeV3.adapter';
import { UniswapV3Adapter } from './adapters/uniswapV3.adapter';

@Injectable()
export class DexAdapterRegistry {
  private readonly adapters: Record<DexId, DexAdapter>;

  constructor(uniV3: UniswapV3Adapter, cakeV3: PancakeV3Adapter) {
    this.adapters = {
      [uniV3.id]: uniV3,
      [cakeV3.id]: cakeV3,
    };
  }

  get(id: DexId): DexAdapter {
    const a = this.adapters[id];

    if (!a) throw new BadRequestException(`No adapter for id ${id}`);

    return a;
  }
}
