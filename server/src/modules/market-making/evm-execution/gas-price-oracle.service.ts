import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BigNumber, ethers } from 'ethers';

import { TradingAccountService } from '../trading-account/trading-account.service';

export type GasPriceQuote = {
  chainId: number;
  maxFeePerGas?: BigNumber;
  maxPriorityFeePerGas?: BigNumber;
  gasPrice: BigNumber;
  quotedAtMs: number;
};

@Injectable()
export class GasPriceOracleService {
  private readonly quotesByChainId = new Map<number, GasPriceQuote>();

  constructor(
    private readonly tradingAccountService: TradingAccountService,
    private readonly configService: ConfigService,
  ) {}

  async quoteGasPrice(
    chainId: number,
    tradingAccountId: string,
  ): Promise<GasPriceQuote> {
    const ttlMs = Number(
      this.configService.get('web3.gas_price_cache_ttl_ms', 10_000),
    );
    const cached = this.quotesByChainId.get(chainId);
    const now = Date.now();

    if (cached && now - cached.quotedAtMs <= ttlMs) {
      return cached;
    }

    const signer = await this.tradingAccountService.getSigner(
      tradingAccountId,
      chainId,
    );

    if (!signer.provider) {
      throw new Error(`No provider configured for chainId=${chainId}`);
    }

    const feeData = await signer.provider.getFeeData();
    const multiplier = Number(
      this.configService.get('web3.gas_multiplier', 1),
    );
    const scaled = (value: BigNumber) =>
      value.mul(Math.round(multiplier * 100)).div(100);
    const gasPrice = scaled(
      feeData.gasPrice ||
        feeData.maxFeePerGas ||
        ethers.BigNumber.from(0),
    );

    if (gasPrice.lte(0)) {
      throw new Error(`Provider returned no gas price for chainId=${chainId}`);
    }

    const quote: GasPriceQuote = {
      chainId,
      gasPrice,
      maxFeePerGas: feeData.maxFeePerGas
        ? scaled(feeData.maxFeePerGas)
        : undefined,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        ? scaled(feeData.maxPriorityFeePerGas)
        : undefined,
      quotedAtMs: now,
    };

    this.quotesByChainId.set(chainId, quote);

    return quote;
  }
}
