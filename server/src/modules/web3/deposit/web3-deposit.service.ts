import { BadRequestException, Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { BalanceLedgerService } from 'src/modules/market-making/ledger/balance-ledger.service';

import { Web3Service } from '../web3.service';

type DepositVerifyBody = {
  chainId?: unknown;
  txHash?: unknown;
  tokenAddress?: unknown;
  amount?: unknown;
};

type SupportedToken = {
  chainId: number;
  assetId: string;
  symbol: string;
  name: string;
  tokenAddress: string;
  decimals: number;
};

const WEB3_DEPOSIT_NAMESPACE = '/web3/deposit';
const WEB3_WALLET_ORDER_PREFIX = 'web3:wallet';

const SUPPORTED_TOKENS_BY_CHAIN: Record<number, SupportedToken[]> = {
  1: [
    {
      chainId: 1,
      assetId: 'evm:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      symbol: 'USDC',
      name: 'USD Coin',
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    },
    {
      chainId: 1,
      assetId: 'evm:1:0xdac17f958d2ee523a2206206994597c13d831ec7',
      symbol: 'USDT',
      name: 'Tether USD',
      tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
    },
  ],
  11155111: [
    {
      chainId: 11155111,
      assetId: 'evm:11155111:0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
      symbol: 'USDC',
      name: 'USD Coin (Sepolia)',
      tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      decimals: 6,
    },
    {
      chainId: 11155111,
      assetId: 'evm:11155111:0x7b79995e5f793a07bc00c21412e50ecae098e7f9',
      symbol: 'WETH',
      name: 'Wrapped Ether (Sepolia)',
      tokenAddress: '0x7b79995e5f793A07bc00c21412e50Ecae098E7f9',
      decimals: 18,
    },
  ],
  137: [
    {
      chainId: 137,
      assetId: 'evm:137:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
      symbol: 'USDC',
      name: 'USD Coin',
      tokenAddress: '0x3c499c542cef5e3811e1192ce70d8cC03d5c3359',
      decimals: 6,
    },
    {
      chainId: 137,
      assetId: 'evm:137:0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
      symbol: 'USDT',
      name: 'Tether USD',
      tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      decimals: 6,
    },
  ],
  56: [
    {
      chainId: 56,
      assetId: 'evm:56:0x55d398326f99059ff775485246999027b3197955',
      symbol: 'USDT',
      name: 'Tether USD',
      tokenAddress: '0x55d398326f99059fF775485246999027B3197955',
      decimals: 18,
    },
    {
      chainId: 56,
      assetId: 'evm:56:0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
      symbol: 'USDC',
      name: 'USD Coin',
      tokenAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      decimals: 18,
    },
  ],
};

@Injectable()
export class Web3DepositService {
  constructor(
    private readonly web3Service: Web3Service,
    private readonly balanceLedgerService: BalanceLedgerService,
  ) {}

  getInstructions(chainIdInput?: unknown) {
    const chainId = this.parseSupportedChainId(chainIdInput);
    const receiverAddress = this.web3Service.getOperatorAddress(chainId);

    return {
      namespace: WEB3_DEPOSIT_NAMESPACE,
      chainId,
      receiverAddress,
      supportedTokens: this.getSupportedTokens(chainId),
    };
  }

  async verifyDeposit(
    userId: string,
    authenticatedWalletAddress: string,
    body: DepositVerifyBody,
  ) {
    const chainId = this.parseSupportedChainId(body?.chainId);
    const token = this.resolveSupportedToken(chainId, body?.tokenAddress);
    const txHash = this.normalizeTxHash(body?.txHash);
    const amount = this.normalizeHumanAmount(body?.amount);
    const receiverAddress = this.web3Service.getOperatorAddress(chainId);
    const onChainAmount = this.toTokenBaseUnits(amount, token);
    const verified = await this.web3Service.verifyTransactionDetails(
      chainId,
      txHash,
      token.tokenAddress,
      receiverAddress,
      onChainAmount,
      authenticatedWalletAddress,
    );

    if (!verified) {
      throw this.badRequest(
        'DEPOSIT_TX_INVALID',
        'Transaction does not match the authenticated deposit request',
      );
    }

    const ledgerResult = await this.balanceLedgerService.creditDeposit({
      orderId: this.getWalletLedgerOrderId(userId),
      userId,
      assetId: token.assetId,
      amount,
      idempotencyKey: `web3:deposit:tx:${chainId}:${txHash}`,
      refType: 'web3_wallet_deposit',
      refId: txHash,
    });

    return {
      namespace: WEB3_DEPOSIT_NAMESPACE,
      deposit: {
        status: ledgerResult.applied ? 'credited' : 'already_credited',
        applied: ledgerResult.applied,
        chainId,
        txHash,
        tokenAddress: token.tokenAddress,
        assetId: token.assetId,
        amount,
        receiverAddress,
        fromAddress: authenticatedWalletAddress.toLowerCase(),
        ledgerEntryId: ledgerResult.entry.entryId,
      },
      balance: {
        orderId: ledgerResult.balance.orderId,
        assetId: ledgerResult.balance.assetId,
        available: ledgerResult.balance.available,
        locked: ledgerResult.balance.locked,
        total: ledgerResult.balance.total,
        updatedAt: ledgerResult.balance.updatedAt,
      },
    };
  }

  private parseSupportedChainId(chainIdInput?: unknown): number {
    const chainId = Number(chainIdInput);

    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw this.badRequest('CHAIN_ID_INVALID', 'chainId is required');
    }
    if (!SUPPORTED_TOKENS_BY_CHAIN[chainId]) {
      throw this.badRequest(
        'CHAIN_UNSUPPORTED',
        `chainId ${chainId} is not supported for deposits`,
      );
    }

    return chainId;
  }

  private getSupportedTokens(chainId: number) {
    return SUPPORTED_TOKENS_BY_CHAIN[chainId].map((token) => ({
      chainId: token.chainId,
      assetId: token.assetId,
      symbol: token.symbol,
      name: token.name,
      tokenAddress: token.tokenAddress,
      decimals: token.decimals,
    }));
  }

  private resolveSupportedToken(
    chainId: number,
    tokenAddressInput?: unknown,
  ): SupportedToken {
    const tokenAddress = this.normalizeAddress(
      tokenAddressInput,
      'TOKEN_ADDRESS_INVALID',
      'tokenAddress must be a valid EVM address',
    );
    const token = SUPPORTED_TOKENS_BY_CHAIN[chainId].find(
      (candidate) =>
        candidate.tokenAddress.toLowerCase() === tokenAddress.toLowerCase(),
    );

    if (!token) {
      throw this.badRequest(
        'TOKEN_UNSUPPORTED',
        'tokenAddress is not supported for the requested chain',
      );
    }

    return token;
  }

  private normalizeAddress(
    addressInput: unknown,
    code: string,
    message: string,
  ): string {
    try {
      return ethers.utils.getAddress(String(addressInput || '').trim());
    } catch {
      throw this.badRequest(code, message);
    }
  }

  private normalizeTxHash(txHashInput?: unknown): string {
    const txHash = String(txHashInput || '')
      .trim()
      .toLowerCase();

    if (!ethers.utils.isHexString(txHash, 32)) {
      throw this.badRequest(
        'TX_HASH_INVALID',
        'txHash must be a 32-byte hex transaction hash',
      );
    }

    return txHash;
  }

  private normalizeHumanAmount(amountInput?: unknown): string {
    const amount = new BigNumber(String(amountInput || '').trim());

    if (!amount.isFinite() || amount.isLessThanOrEqualTo(0)) {
      throw this.badRequest(
        'AMOUNT_INVALID',
        'amount must be a positive numeric string',
      );
    }

    return amount.toFixed();
  }

  private toTokenBaseUnits(amount: string, token: SupportedToken) {
    try {
      return ethers.utils.parseUnits(amount, token.decimals);
    } catch {
      throw this.badRequest(
        'AMOUNT_INVALID',
        `amount must fit ${token.decimals} token decimals`,
      );
    }
  }

  private getWalletLedgerOrderId(userId: string): string {
    return `${WEB3_WALLET_ORDER_PREFIX}:${userId}`;
  }

  private badRequest(code: string, message: string) {
    return new BadRequestException({
      code,
      message,
      timestamp: getRFC3339Timestamp(),
    });
  }
}
