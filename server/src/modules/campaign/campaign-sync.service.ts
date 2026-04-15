import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { Repository } from 'typeorm';

import { CampaignService } from './campaign.service';

type CampaignRecord = {
  address?: string;
  chainId?: number | string;
  symbol?: string;
  exchangeName?: string;
  token?: string;
  totalFundedAmount?: string | number;
  type?: string;
  status?: string;
  startBlock?: number | string;
  endBlock?: number | string;
};

@Injectable()
export class CampaignSyncService {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly campaignRepository: Repository<any>,
  ) {}

  async syncCampaigns(): Promise<number> {
    const campaigns = await this.campaignService.getCampaigns();
    let synced = 0;

    for (const campaign of campaigns) {
      if (!this.isSupportedCampaign(campaign)) {
        continue;
      }

      const normalized = this.normalizeCampaign(campaign);

      try {
        const existing = await this.campaignRepository.findOneBy({
          address: normalized.address,
          chainId: normalized.chainId,
        });

        const entity = existing
          ? { ...existing, ...normalized }
          : this.campaignRepository.create(normalized);

        await this.campaignRepository.save(entity);
        synced += 1;
      } catch {
        continue;
      }
    }

    return synced;
  }

  private isSupportedCampaign(campaign: CampaignRecord): boolean {
    return String(campaign.exchangeName || '').toLowerCase() === 'binance';
  }

  private normalizeCampaign(campaign: CampaignRecord) {
    const startTime = this.toValidDate(campaign.startBlock);
    const endTime = this.toValidDate(campaign.endBlock);

    return {
      address: String(campaign.address || '').toLowerCase(),
      chainId: Number(campaign.chainId || 0),
      symbol: campaign.symbol || '',
      exchangeName: String(campaign.exchangeName || '').toLowerCase(),
      token: campaign.token || '',
      totalReward: this.toNumber(campaign.totalFundedAmount),
      type: campaign.type || '',
      status: this.normalizeStatus(campaign.status),
      startTime,
      endTime,
    };
  }

  private toNumber(value: string | number | undefined): number {
    const normalized = new BigNumber(value ?? 0);

    return normalized.isFinite() ? normalized.toNumber() : 0;
  }

  private toValidDate(value: string | number | undefined): Date {
    const numeric = Number(value);

    if (Number.isFinite(numeric) && numeric > 0) {
      return new Date(numeric * 1000);
    }

    return new Date(0);
  }

  private normalizeStatus(status: string | undefined): string {
    return String(status || '').toLowerCase() === 'running'
      ? 'active'
      : String(status || '').toLowerCase();
  }
}
