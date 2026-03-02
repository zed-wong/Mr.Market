import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { BigNumber as EthersBigNumber, ethers } from 'ethers';
import { DexAdapterRegistry } from 'src/defi/adapter-registry';
import type { DexId } from 'src/defi/addresses';
import { ensureAllowance, readDecimals } from 'src/defi/utils/erc20';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Web3Service } from 'src/modules/web3/web3.service';

type DexVolumeExecutionRequest = {
  dexId: DexId;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  feeTier: number;
  baseTradeAmount: number;
  baseIncrementPercentage: number;
  pricePushRate: number;
  executedTrades: number;
  side: 'buy' | 'sell';
  slippageBps?: number;
  recipient?: string;
};

type DexVolumeExecutionResult = {
  txHash: string;
  side: 'buy' | 'sell';
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  quotedAmountOut: string;
  minAmountOut: string;
  slippageBps: number;
};

@Injectable()
export class DexVolumeStrategyService {
  private readonly logger = new CustomLogger(DexVolumeStrategyService.name);

  constructor(
    private readonly dexAdapterRegistry: DexAdapterRegistry,
    private readonly web3Service: Web3Service,
  ) {}

  async executeCycle(
    req: DexVolumeExecutionRequest,
  ): Promise<DexVolumeExecutionResult> {
    const adapter = this.dexAdapterRegistry.get(req.dexId);

    if (!adapter.supportsChain(req.chainId)) {
      throw new Error(
        `DEX ${req.dexId} is not configured for chainId=${req.chainId}`,
      );
    }

    const signer = this.web3Service.getSigner(req.chainId);

    if (!signer || !signer.provider) {
      throw new Error(
        `No signer/provider configured for chainId=${req.chainId}. Check WEB3 RPC and private key config.`,
      );
    }

    const canonicalTokenIn = ethers.utils.getAddress(req.tokenIn);
    const canonicalTokenOut = ethers.utils.getAddress(req.tokenOut);

    if (canonicalTokenIn === canonicalTokenOut) {
      throw new Error('tokenIn and tokenOut must be different addresses');
    }

    const side = req.side;
    const effectiveTokenIn =
      side === 'buy' ? canonicalTokenIn : canonicalTokenOut;
    const effectiveTokenOut =
      side === 'buy' ? canonicalTokenOut : canonicalTokenIn;

    if (
      effectiveTokenIn === ethers.constants.AddressZero ||
      effectiveTokenOut === ethers.constants.AddressZero
    ) {
      throw new Error(
        'Native token swaps are not supported; use wrapped token',
      );
    }

    const pool = await adapter.getPool(
      signer.provider,
      req.chainId,
      effectiveTokenIn,
      effectiveTokenOut,
      req.feeTier,
    );

    if (!pool || pool === ethers.constants.AddressZero) {
      throw new Error(
        `No v3 pool found for token pair on ${req.dexId} chain=${req.chainId} feeTier=${req.feeTier}`,
      );
    }

    const tokenInDecimals = await readDecimals(
      signer.provider,
      effectiveTokenIn,
    );
    const amountInHuman = this.computeAmountIn(req);
    const amountInString = amountInHuman
      .decimalPlaces(tokenInDecimals, BigNumber.ROUND_DOWN)
      .toFixed();

    if (
      !amountInString ||
      new BigNumber(amountInString).isLessThanOrEqualTo(0)
    ) {
      throw new Error(
        `Computed amountIn is non-positive after precision normalization: ${amountInString}`,
      );
    }

    const amountIn = ethers.utils.parseUnits(amountInString, tokenInDecimals);
    const quote = await adapter.quoteExactInputSingle(
      signer.provider,
      req.chainId,
      {
        tokenIn: effectiveTokenIn,
        tokenOut: effectiveTokenOut,
        amountIn,
        fee: req.feeTier,
      },
    );
    const slippageBps = this.resolveSlippageBps(
      req.slippageBps,
      req.baseIncrementPercentage,
    );
    const minAmountOut = quote.amountOut.mul(10000 - slippageBps).div(10000);

    if (minAmountOut.lte(EthersBigNumber.from(0))) {
      throw new Error('Computed amountOutMinimum is non-positive');
    }

    const owner = ethers.utils.getAddress(await signer.getAddress());

    if (owner === ethers.constants.AddressZero) {
      throw new Error('Invalid owner address: zero address is not allowed');
    }

    const router = adapter.getAddresses(req.chainId).router;
    const requestedRecipient = req.recipient
      ? ethers.utils.getAddress(req.recipient)
      : undefined;

    if (requestedRecipient === ethers.constants.AddressZero) {
      throw new Error(
        `Invalid recipient address: ${req.recipient}. Zero address is not allowed`,
      );
    }

    const recipient = requestedRecipient ?? owner;

    if (recipient === ethers.constants.AddressZero) {
      throw new Error(
        `Invalid recipient address: ${recipient}. owner=${owner} req.recipient=${req.recipient ?? 'undefined'}`,
      );
    }

    await ensureAllowance(signer, effectiveTokenIn, owner, router, amountIn);

    const receipt = await adapter.exactInputSingle(signer, req.chainId, {
      tokenIn: effectiveTokenIn,
      tokenOut: effectiveTokenOut,
      fee: req.feeTier,
      recipient,
      deadline: Math.floor(Date.now() / 1000) + 120,
      amountIn,
      amountOutMinimum: minAmountOut,
    });

    this.logger.log(
      `Executed dex volume swap side=${side} dex=${req.dexId} chain=${req.chainId} txHash=${receipt.transactionHash}`,
    );

    return {
      txHash: receipt.transactionHash,
      side,
      tokenIn: effectiveTokenIn,
      tokenOut: effectiveTokenOut,
      amountIn: amountIn.toString(),
      quotedAmountOut: quote.amountOut.toString(),
      minAmountOut: minAmountOut.toString(),
      slippageBps,
    };
  }

  private computeAmountIn(req: DexVolumeExecutionRequest): BigNumber {
    const baseAmount = new BigNumber(req.baseTradeAmount);

    if (!baseAmount.isFinite() || baseAmount.isLessThanOrEqualTo(0)) {
      throw new Error(
        `baseTradeAmount must be a finite positive number, got: ${req.baseTradeAmount}`,
      );
    }

    const pushMultiplier = new BigNumber(1).plus(
      new BigNumber(req.pricePushRate || 0)
        .dividedBy(100)
        .multipliedBy(req.executedTrades || 0),
    );
    const incrementMultiplier = new BigNumber(1).plus(
      new BigNumber(req.baseIncrementPercentage || 0).dividedBy(100),
    );
    const amount = baseAmount
      .multipliedBy(pushMultiplier)
      .multipliedBy(incrementMultiplier);

    if (!amount.isFinite() || amount.isLessThanOrEqualTo(0)) {
      throw new Error(`computed amountIn is invalid: ${amount.toFixed()}`);
    }

    return amount;
  }

  private resolveSlippageBps(
    explicitBps: number | undefined,
    fallbackIncrementPct: number,
  ): number {
    const fallbackBps = Math.round(Number(fallbackIncrementPct || 0) * 100);
    const candidate = Number(
      explicitBps !== undefined ? explicitBps : fallbackBps,
    );

    if (!Number.isFinite(candidate)) {
      return 100;
    }

    return Math.max(1, Math.min(5000, Math.floor(candidate)));
  }
}

export type { DexVolumeExecutionRequest, DexVolumeExecutionResult };
