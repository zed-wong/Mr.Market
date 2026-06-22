import { BigNumber, ethers } from 'ethers';
import type { ConnectorId } from 'src/common/constants/connector-addresses';

export type QuoteSingleParams = {
  tokenIn: string;
  tokenOut: string;
  fee: number; // v3 fee tier (500/3000/10000)
  amountIn: BigNumber;
  sqrtPriceLimitX96?: BigNumber | string;
};

export type ExactInputSingleParams = {
  tokenIn: string;
  tokenOut: string;
  fee: number;
  recipient: string;
  deadline: number;
  amountIn: BigNumber;
  amountOutMinimum: BigNumber;
  sqrtPriceLimitX96?: BigNumber | string;
  transaction?: ethers.providers.TransactionRequest;
};

export type MintPositionParams = {
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: BigNumber;
  amount1Desired: BigNumber;
  amount0Min: BigNumber;
  amount1Min: BigNumber;
  recipient: string;
  deadline: number;
  transaction?: ethers.providers.TransactionRequest;
};

export type IncreaseLiquidityParams = {
  tokenId: string;
  amount0Desired: BigNumber;
  amount1Desired: BigNumber;
  amount0Min: BigNumber;
  amount1Min: BigNumber;
  deadline: number;
  transaction?: ethers.providers.TransactionRequest;
};

export type DecreaseLiquidityParams = {
  tokenId: string;
  liquidity: BigNumber;
  amount0Min: BigNumber;
  amount1Min: BigNumber;
  deadline: number;
  transaction?: ethers.providers.TransactionRequest;
};

export type CollectFeesParams = {
  tokenId: string;
  recipient: string;
  amount0Max: BigNumber;
  amount1Max: BigNumber;
  transaction?: ethers.providers.TransactionRequest;
};

export type PositionState = {
  owner: string;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  uncollectedFees0?: string;
  uncollectedFees1?: string;
};

export type PoolState = {
  currentTick: number;
  sqrtPriceX96: string;
  liquidity: string;
};

export interface EvmDexAdapter {
  readonly id: ConnectorId;
  supportsChain(chainId: number): boolean;

  getAddresses(chainId: number): {
    factory: string;
    router: string;
    quoterV2: string;
    weth: string;
  };

  getPool(
    provider: ethers.providers.Provider,
    chainId: number,
    tokenIn: string,
    tokenOut: string,
    fee: number,
  ): Promise<string>;

  quoteExactInputSingle(
    provider: ethers.providers.Provider,
    chainId: number,
    p: QuoteSingleParams,
  ): Promise<{ amountOut: BigNumber }>;

  estimateGasExactInputSingle(
    signer: ethers.Signer,
    chainId: number,
    p: ExactInputSingleParams,
  ): Promise<BigNumber>;

  exactInputSingle(
    signer: ethers.Signer,
    chainId: number,
    p: ExactInputSingleParams,
  ): Promise<ethers.providers.TransactionResponse>;

  mint(
    signer: ethers.Signer,
    chainId: number,
    p: MintPositionParams,
  ): Promise<ethers.providers.TransactionResponse>;

  increaseLiquidity(
    signer: ethers.Signer,
    chainId: number,
    p: IncreaseLiquidityParams,
  ): Promise<ethers.providers.TransactionResponse>;

  decreaseLiquidity(
    signer: ethers.Signer,
    chainId: number,
    p: DecreaseLiquidityParams,
  ): Promise<ethers.providers.TransactionResponse>;

  collect(
    signer: ethers.Signer,
    chainId: number,
    p: CollectFeesParams,
  ): Promise<ethers.providers.TransactionResponse>;

  readPosition(
    provider: ethers.providers.Provider,
    chainId: number,
    tokenId: string,
  ): Promise<PositionState>;

  readPoolState(
    provider: ethers.providers.Provider,
    chainId: number,
    poolAddress: string,
  ): Promise<PoolState>;
}
