import { BadRequestException, Injectable } from '@nestjs/common';
import type { ConnectorId } from 'src/common/constants/connector-addresses';

import type { EvmDexAdapter } from './evm-dex-adapter';
import { PancakeV3Adapter } from './pancake-v3.adapter';
import { UniswapV3Adapter } from './uniswap-v3.adapter';

@Injectable()
export class EvmDexAdapterRegistry {
  private readonly adapters: Record<ConnectorId, EvmDexAdapter>;

  constructor(uniV3: UniswapV3Adapter, cakeV3: PancakeV3Adapter) {
    this.adapters = {
      [uniV3.id]: uniV3,
      [cakeV3.id]: cakeV3,
    };
  }

  get(id: ConnectorId): EvmDexAdapter {
    const a = this.adapters[id];

    if (!a) throw new BadRequestException(`No adapter for id ${id}`);

    return a;
  }
}
