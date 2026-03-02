import { Injectable } from '@nestjs/common';
import { BaseUniswapV3Adapter } from './base-uniswap-v3.adapter';

/**
 * Pancake v3 is a Uniswap v3 fork; ABIs are compatible. Addresses must be set in DEX_ADDRESSES.pancakeV3.
 */
@Injectable()
export class PancakeV3Adapter extends BaseUniswapV3Adapter {
  readonly id = 'pancakeV3' as const;
  protected readonly addressKey = 'pancakeV3' as const;
}
