import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ethers } from 'ethers';
import { TokenRegistryEntry } from 'src/common/entities/market-making/token-registry-entry.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Repository } from 'typeorm';

export type UpsertTokenRegistryEntryCommand = {
  assetId: string;
  chainId: number;
  contractAddress: string;
  symbol: string;
  decimals: number;
  isNative?: boolean;
};

@Injectable()
export class TokenRegistryService {
  constructor(
    @InjectRepository(TokenRegistryEntry)
    private readonly tokenRegistryRepository: Repository<TokenRegistryEntry>,
  ) {}

  async upsert(
    command: UpsertTokenRegistryEntryCommand,
  ): Promise<TokenRegistryEntry> {
    const now = getRFC3339Timestamp();
    const normalized = this.normalizeCommand(command);
    const existing = await this.tokenRegistryRepository.findOneBy({
      assetId: normalized.assetId,
    });
    const entry = this.tokenRegistryRepository.create({
      ...(existing || {}),
      ...normalized,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });

    return await this.tokenRegistryRepository.save(entry);
  }

  async resolveAssetId(
    chainId: number,
    contractAddress: string,
  ): Promise<string> {
    const token = await this.tokenRegistryRepository.findOneBy({
      chainId,
      contractAddress: this.normalizeAddress(contractAddress),
    });

    if (!token) {
      throw new BadRequestException(
        `Token is not registered for chainId=${chainId} contractAddress=${contractAddress}`,
      );
    }

    return token.assetId;
  }

  async resolveToken(assetId: string): Promise<TokenRegistryEntry> {
    const token = await this.tokenRegistryRepository.findOneBy({ assetId });

    if (!token) {
      throw new BadRequestException(`Token assetId ${assetId} is not registered`);
    }

    return token;
  }

  async list(): Promise<TokenRegistryEntry[]> {
    return await this.tokenRegistryRepository.find({
      order: { chainId: 'ASC', symbol: 'ASC', assetId: 'ASC' },
    });
  }

  async resolveNativeAssetId(chainId: number): Promise<string> {
    const token = await this.tokenRegistryRepository.findOneBy({
      chainId,
      isNative: true,
    });

    if (!token) {
      throw new BadRequestException(
        `Native token is not registered for chainId=${chainId}`,
      );
    }

    return token.assetId;
  }

  private normalizeCommand(
    command: UpsertTokenRegistryEntryCommand,
  ): UpsertTokenRegistryEntryCommand {
    const chainId = Number(command.chainId);
    const decimals = Number(command.decimals);
    const symbol = command.symbol.trim();
    const assetId = command.assetId.trim();

    if (!assetId) {
      throw new BadRequestException('assetId is required');
    }
    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw new BadRequestException('chainId must be a positive integer');
    }
    if (!symbol) {
      throw new BadRequestException('symbol is required');
    }
    if (!Number.isInteger(decimals) || decimals < 0) {
      throw new BadRequestException('decimals must be a non-negative integer');
    }

    return {
      ...command,
      assetId,
      chainId,
      contractAddress: this.normalizeAddress(command.contractAddress),
      symbol,
      decimals,
      isNative: Boolean(command.isNative),
    };
  }

  private normalizeAddress(contractAddress: string): string {
    const normalized = String(contractAddress || '').trim();

    if (normalized === ethers.constants.AddressZero) {
      return normalized;
    }

    return ethers.utils.getAddress(normalized);
  }
}
