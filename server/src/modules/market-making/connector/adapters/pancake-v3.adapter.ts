import { Injectable } from '@nestjs/common';
import { BigNumber, ethers } from 'ethers';
import { CONNECTOR_ADDRESSES } from 'src/common/constants/connector-addresses';

import {
  UNISWAP_V3_FACTORY_ABI,
  UNISWAP_V3_QUOTER_V2_ABI,
  UNISWAP_V3_ROUTER_ABI,
} from './abis';
import {
  EvmDexAdapter,
  ExactInputSingleParams,
  PoolState,
  PositionState,
  QuoteSingleParams,
} from './evm-dex-adapter';

/**
 * Pancake v3 is a Uniswap v3 fork; ABIs are compatible.
 */
@Injectable()
export class PancakeV3Adapter implements EvmDexAdapter {
  readonly id = 'pancakeV3' as const;

  supportsChain(chainId: number): boolean {
    return !!CONNECTOR_ADDRESSES.pancakeV3[chainId];
  }

  getAddresses(chainId: number) {
    const a = CONNECTOR_ADDRESSES.pancakeV3[chainId];

    if (!a) throw new Error(`PancakeV3 not configured for chain ${chainId}`);

    return a;
  }

  async getPool(
    provider: ethers.providers.Provider,
    chainId: number,
    tokenIn: string,
    tokenOut: string,
    fee: number,
  ) {
    const { factory } = this.getAddresses(chainId);
    const c = new ethers.Contract(factory, UNISWAP_V3_FACTORY_ABI, provider);

    return await c.getPool(tokenIn, tokenOut, fee);
  }

  async quoteExactInputSingle(
    provider: ethers.providers.Provider,
    chainId: number,
    p: QuoteSingleParams,
  ) {
    const { quoterV2 } = this.getAddresses(chainId);
    const q = new ethers.Contract(quoterV2, UNISWAP_V3_QUOTER_V2_ABI, provider);
    const res = await q.callStatic.quoteExactInputSingle({
      tokenIn: p.tokenIn,
      tokenOut: p.tokenOut,
      amountIn: p.amountIn,
      fee: p.fee,
      sqrtPriceLimitX96: p.sqrtPriceLimitX96 ?? 0,
    });

    return { amountOut: res[0] as BigNumber };
  }

  async estimateGasExactInputSingle(
    signer: ethers.Signer,
    chainId: number,
    p: ExactInputSingleParams,
  ) {
    const { router } = this.getAddresses(chainId);
    const r = new ethers.Contract(router, UNISWAP_V3_ROUTER_ABI, signer);

    return await r.estimateGas.exactInputSingle({
      tokenIn: p.tokenIn,
      tokenOut: p.tokenOut,
      fee: p.fee,
      recipient: p.recipient,
      deadline: p.deadline,
      amountIn: p.amountIn,
      amountOutMinimum: p.amountOutMinimum,
      sqrtPriceLimitX96: p.sqrtPriceLimitX96 ?? 0,
    });
  }

  async exactInputSingle(
    signer: ethers.Signer,
    chainId: number,
    p: ExactInputSingleParams,
  ) {
    const { router } = this.getAddresses(chainId);
    const r = new ethers.Contract(router, UNISWAP_V3_ROUTER_ABI, signer);
    return await r.exactInputSingle(
      {
        tokenIn: p.tokenIn,
        tokenOut: p.tokenOut,
        fee: p.fee,
        recipient: p.recipient,
        deadline: p.deadline,
        amountIn: p.amountIn,
        amountOutMinimum: p.amountOutMinimum,
        sqrtPriceLimitX96: p.sqrtPriceLimitX96 ?? 0,
      },
      p.transaction || {},
    );
  }

  async mint(): Promise<ethers.providers.TransactionResponse> {
    throw new Error('PancakeV3 LP mint is not implemented yet');
  }

  async increaseLiquidity(): Promise<ethers.providers.TransactionResponse> {
    throw new Error('PancakeV3 LP increaseLiquidity is not implemented yet');
  }

  async decreaseLiquidity(): Promise<ethers.providers.TransactionResponse> {
    throw new Error('PancakeV3 LP decreaseLiquidity is not implemented yet');
  }

  async collect(): Promise<ethers.providers.TransactionResponse> {
    throw new Error('PancakeV3 LP collect is not implemented yet');
  }

  async readPosition(): Promise<PositionState> {
    throw new Error('PancakeV3 LP readPosition is not implemented yet');
  }

  async readPoolState(): Promise<PoolState> {
    throw new Error('PancakeV3 LP readPoolState is not implemented yet');
  }
}
