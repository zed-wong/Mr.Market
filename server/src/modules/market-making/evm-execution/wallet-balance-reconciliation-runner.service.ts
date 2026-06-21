import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';

import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { TokenRegistryService } from '../token-registry/token-registry.service';
import { TradingAccountService } from '../trading-account/trading-account.service';

export type WalletBalanceReconciliationMismatch = {
  assetId: string;
  ledgerAmount: string;
  walletAmount: string;
};

export type WalletBalanceReconciliationResult = {
  tradingAccountId: string;
  chainId: number;
  matches: boolean;
  mismatches: WalletBalanceReconciliationMismatch[];
};

@Injectable()
export class WalletBalanceReconciliationRunner {
  constructor(
    private readonly balanceLedgerService: BalanceLedgerService,
    private readonly tokenRegistryService: TokenRegistryService,
    private readonly tradingAccountService: TradingAccountService,
  ) {}

  async reconcileWallet(params: {
    tradingAccountId: string;
    chainId: number;
    assetIds: string[];
  }): Promise<WalletBalanceReconciliationResult> {
    const signer = await this.tradingAccountService.getSigner(
      params.tradingAccountId,
      params.chainId,
    );

    if (!signer.provider) {
      throw new Error(`No provider configured for chainId=${params.chainId}`);
    }

    const address = await signer.getAddress();
    const balances = await this.balanceLedgerService.findBalancesByTradingAccount(
      params.tradingAccountId,
      params.chainId,
    );
    const mismatches: WalletBalanceReconciliationMismatch[] = [];

    for (const assetId of params.assetIds) {
      const token = await this.tokenRegistryService.resolveToken(assetId);
      const ledgerAmount = balances
        .filter((balance) => balance.assetId === assetId)
        .reduce(
          (total, balance) =>
            total
              .plus(balance.available || 0)
              .plus(balance.locked || 0)
              .plus(balance.externalLocked || 0),
          new BigNumber(0),
        );
      const walletAmount = await this.readWalletAmount(
        signer.provider,
        address,
        token.contractAddress,
        token.decimals,
        token.isNative,
      );

      if (!ledgerAmount.isEqualTo(walletAmount)) {
        mismatches.push({
          assetId,
          ledgerAmount: ledgerAmount.toFixed(),
          walletAmount: walletAmount.toFixed(),
        });
      }
    }

    return {
      tradingAccountId: params.tradingAccountId,
      chainId: params.chainId,
      matches: mismatches.length === 0,
      mismatches,
    };
  }

  private async readWalletAmount(
    provider: ethers.providers.Provider,
    walletAddress: string,
    contractAddress: string,
    decimals: number,
    isNative: boolean,
  ): Promise<BigNumber> {
    const rawBalance = isNative
      ? await provider.getBalance(walletAddress)
      : await new ethers.Contract(
          contractAddress,
          ['function balanceOf(address owner) view returns (uint256)'],
          provider,
        ).balanceOf(walletAddress);

    return new BigNumber(ethers.utils.formatUnits(rawBalance, decimals));
  }
}
