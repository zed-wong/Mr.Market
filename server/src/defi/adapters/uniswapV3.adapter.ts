import { Injectable } from '@nestjs/common';
import { BaseUniswapV3Adapter } from './base-uniswap-v3.adapter';

@Injectable()
export class UniswapV3Adapter extends BaseUniswapV3Adapter {
  readonly id = 'uniswapV3' as const;
  protected readonly addressKey = 'uniswapV3' as const;
}
