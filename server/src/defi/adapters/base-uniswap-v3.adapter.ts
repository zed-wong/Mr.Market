import { BigNumber, ethers } from 'ethers';

import {
  UNISWAP_V3_FACTORY_ABI,
  UNISWAP_V3_QUOTER_V2_ABI,
  UNISWAP_V3_ROUTER_ABI,
} from '../abis';
import { DEX_ADDRESSES, DexId } from '../addresses';
import {
  DexAdapter,
  ExactInputExecutionOptions,
  ExactInputSingleParams,
  QuoteSingleParams,
} from './dex-adapter';

export abstract class BaseUniswapV3Adapter implements DexAdapter {
  abstract readonly id: DexId;
  protected abstract readonly addressKey: keyof typeof DEX_ADDRESSES;

  supportsChain(chainId: number): boolean {
    return !!DEX_ADDRESSES[this.addressKey][chainId];
  }

  getAddresses(chainId: number) {
    const addresses = DEX_ADDRESSES[this.addressKey][chainId];

    if (!addresses) {
      throw new Error(`${this.id} not configured for chain ${chainId}`);
    }

    return addresses;
  }

  async getPool(
    provider: ethers.providers.Provider,
    chainId: number,
    tokenIn: string,
    tokenOut: string,
    fee: number,
  ) {
    const { factory } = this.getAddresses(chainId);
    const factoryContract = new ethers.Contract(
      factory,
      UNISWAP_V3_FACTORY_ABI,
      provider,
    );

    return await factoryContract.getPool(tokenIn, tokenOut, fee);
  }

  async quoteExactInputSingle(
    provider: ethers.providers.Provider,
    chainId: number,
    p: QuoteSingleParams,
  ) {
    const { quoterV2 } = this.getAddresses(chainId);
    const quoterContract = new ethers.Contract(
      quoterV2,
      UNISWAP_V3_QUOTER_V2_ABI,
      provider,
    );
    const result = await quoterContract.callStatic.quoteExactInputSingle({
      tokenIn: p.tokenIn,
      tokenOut: p.tokenOut,
      amountIn: p.amountIn,
      fee: p.fee,
      sqrtPriceLimitX96: p.sqrtPriceLimitX96 ?? 0,
    });

    return { amountOut: result[0] as BigNumber };
  }

  async estimateGasExactInputSingle(
    signer: ethers.Signer,
    chainId: number,
    p: ExactInputSingleParams,
  ) {
    const { router } = this.getAddresses(chainId);
    const routerContract = new ethers.Contract(router, UNISWAP_V3_ROUTER_ABI, signer);

    return await routerContract.estimateGas.exactInputSingle({
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
    options?: ExactInputExecutionOptions,
  ) {
    const { router } = this.getAddresses(chainId);
    const routerContract = new ethers.Contract(router, UNISWAP_V3_ROUTER_ABI, signer);
    const tx = await routerContract.exactInputSingle({
      tokenIn: p.tokenIn,
      tokenOut: p.tokenOut,
      fee: p.fee,
      recipient: p.recipient,
      deadline: p.deadline,
      amountIn: p.amountIn,
      amountOutMinimum: p.amountOutMinimum,
      sqrtPriceLimitX96: p.sqrtPriceLimitX96 ?? 0,
    });
    const confirmations = options?.confirmations ?? 1;
    const receiptPromise = tx.wait(confirmations);
    const timeoutMs = options?.timeoutMs;

    if (!timeoutMs || timeoutMs <= 0) {
      return await receiptPromise;
    }

    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        receiptPromise,
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(
              new Error(
                `${this.id} exactInputSingle timed out after ${timeoutMs}ms waiting for ${confirmations} confirmation(s)`,
              ),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
