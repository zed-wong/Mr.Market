import { BadRequestException, Injectable } from '@nestjs/common';
import { ethers } from 'ethers';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';

import { Web3Service } from '../web3.service';

export type SupportedToken = {
  chainId: number;
  assetId: string;
  symbol: string;
  name: string;
  tokenAddress: string;
  decimals: number;
};

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
  constructor(private readonly web3Service: Web3Service) {}

  getInstructions(chainIdInput?: unknown) {
    const chainId = this.parseSupportedChainId(chainIdInput);
    const receiverAddress = this.web3Service.getOperatorAddress(chainId);

    return {
      namespace: '/web3/funding-requests' as const,
      chainId,
      receiverAddress,
      supportedTokens: this.getSupportedTokens(chainId),
    };
  }

  resolveSupportedTokenForChain(
    chainIdInput?: unknown,
    tokenAddressInput?: unknown,
  ): SupportedToken {
    const chainId = this.parseSupportedChainId(chainIdInput);

    return this.resolveSupportedToken(chainId, tokenAddressInput);
  }

  private parseSupportedChainId(chainIdInput?: unknown): number {
    const chainId = Number(chainIdInput);

    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw this.badRequest('CHAIN_ID_INVALID', 'chainId is required');
    }
    if (!SUPPORTED_TOKENS_BY_CHAIN[chainId]) {
      throw this.badRequest(
        'CHAIN_UNSUPPORTED',
        `chainId ${chainId} is not supported for Router funding`,
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

  private badRequest(code: string, message: string) {
    return new BadRequestException({
      code,
      message,
      timestamp: getRFC3339Timestamp(),
    });
  }
}
