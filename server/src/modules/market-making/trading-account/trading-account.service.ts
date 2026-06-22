import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ethers } from 'ethers';
import {
  TradingAccount,
  TradingAccountPurpose,
  TradingAccountValidationStatus,
} from 'src/common/entities/market-making/trading-account.entity';
import { decrypt } from 'src/common/helpers/crypto';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Repository } from 'typeorm';

export type CreateTradingAccountCommand = {
  id: string;
  label: string;
  purpose: TradingAccountPurpose;
  chainIds: number[];
  walletAddress: string;
  encryptedPrivateKey: string;
  validationStatus?: TradingAccountValidationStatus;
};

export type TradingAccountWalletCredentials = {
  id: string;
  label: string;
  purpose: TradingAccountPurpose;
  walletAddress: string;
  privateKey: string;
};

@Injectable()
export class TradingAccountService {
  constructor(
    @InjectRepository(TradingAccount)
    private readonly tradingAccountRepository: Repository<TradingAccount>,
    private readonly configService: ConfigService,
  ) {}

  async create(command: CreateTradingAccountCommand): Promise<TradingAccount> {
    const now = getRFC3339Timestamp();
    const normalizedChainIds = this.normalizeChainIds(command.chainIds);
    const walletAddress = ethers.utils.getAddress(command.walletAddress);
    const account = this.tradingAccountRepository.create({
      id: command.id,
      label: command.label.trim(),
      type: 'evm_wallet',
      purpose: command.purpose,
      chainIds: normalizedChainIds,
      walletAddress,
      encryptedPrivateKey: command.encryptedPrivateKey,
      validationStatus: command.validationStatus || 'pending',
      createdAt: now,
      updatedAt: now,
    });

    if (!account.label) {
      throw new BadRequestException('Trading account label is required');
    }

    return await this.tradingAccountRepository.save(account);
  }

  async findById(accountId: string): Promise<TradingAccount | null> {
    return await this.tradingAccountRepository.findOneBy({ id: accountId });
  }

  async listByPurpose(
    purpose: TradingAccountPurpose,
  ): Promise<TradingAccount[]> {
    return await this.tradingAccountRepository.find({
      where: { purpose },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }

  async getSigner(
    accountId: string,
    chainId: number,
  ): Promise<ethers.Wallet> {
    const account = await this.findById(accountId);

    if (!account) {
      throw new BadRequestException(`Trading account ${accountId} not found`);
    }

    return this.buildSigner(account, chainId);
  }

  async getSignerForPurpose(
    purpose: TradingAccountPurpose,
    chainId: number,
  ): Promise<ethers.Wallet> {
    const accounts = await this.listByPurpose(purpose);
    const account = accounts.find(
      (candidate) =>
        candidate.validationStatus === 'valid' &&
        candidate.chainIds.includes(chainId),
    );

    if (!account) {
      throw new BadRequestException(
        `No valid ${purpose} trading account configured for chainId=${chainId}`,
      );
    }

    return this.buildSigner(account, chainId);
  }

  async listValidWalletCredentialsByPurpose(
    purpose: TradingAccountPurpose,
  ): Promise<TradingAccountWalletCredentials[]> {
    const accounts = await this.listByPurpose(purpose);

    return accounts
      .filter((account) => account.validationStatus === 'valid')
      .map((account) => ({
        id: account.id,
        label: account.label,
        purpose: account.purpose,
        walletAddress: account.walletAddress,
        privateKey: this.decryptPrivateKey(account),
      }));
  }

  private buildSigner(
    account: TradingAccount,
    chainId: number,
  ): ethers.Wallet {
    if (account.type !== 'evm_wallet') {
      throw new BadRequestException(
        `Trading account ${account.id} is not an EVM wallet`,
      );
    }

    if (!account.chainIds.includes(chainId)) {
      throw new BadRequestException(
        `Trading account ${account.id} does not support chainId=${chainId}`,
      );
    }

    const privateKey = this.decryptPrivateKey(account);
    const provider = this.getProvider(chainId);
    const wallet = new ethers.Wallet(privateKey, provider);

    if (
      wallet.address.toLowerCase() !== account.walletAddress.toLowerCase()
    ) {
      throw new BadRequestException(
        `Trading account ${account.id} private key does not match walletAddress`,
      );
    }

    return wallet;
  }

  private decryptPrivateKey(account: TradingAccount): string {
    const adminPrivateKey =
      this.configService.get<string>('admin.encryption_private_key') || '';

    if (!adminPrivateKey) {
      throw new BadRequestException(
        'admin.encryption_private_key is required for trading account decryption',
      );
    }

    const decrypted = decrypt(account.encryptedPrivateKey, adminPrivateKey);

    if (!decrypted) {
      throw new BadRequestException(
        `Trading account ${account.id} private key decryption failed`,
      );
    }

    return decrypted.trim();
  }

  private getProvider(chainId: number): ethers.providers.JsonRpcProvider {
    const rpcUrl = this.getRpcUrl(chainId);

    if (!rpcUrl) {
      throw new BadRequestException(`No RPC URL configured for chainId=${chainId}`);
    }

    return new ethers.providers.JsonRpcProvider(rpcUrl);
  }

  private getRpcUrl(chainId: number): string | undefined {
    const keyByChainId: Record<number, string> = {
      1: 'web3.network.mainnet.rpc_url',
      11155111: 'web3.network.sepolia.rpc_url',
      137: 'web3.network.polygon.rpc_url',
      80002: 'web3.network.polygon_amoy.rpc_url',
      56: 'web3.network.bsc.rpc_url',
      97: 'web3.network.bsc_testnet.rpc_url',
    };
    const key = keyByChainId[chainId];

    return key ? this.configService.get<string>(key) : undefined;
  }

  private normalizeChainIds(chainIds: number[]): number[] {
    const normalized = [...new Set(chainIds.map((chainId) => Number(chainId)))]
      .filter((chainId) => Number.isInteger(chainId) && chainId > 0)
      .sort((a, b) => a - b);

    if (normalized.length === 0) {
      throw new BadRequestException('At least one chainId is required');
    }

    return normalized;
  }
}
