import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { Campaign } from 'src/common/entities/campaign/campaign.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Repository } from 'typeorm';

import { CampaignService } from './campaign.service';

@Injectable()
export class CampaignSyncService {
  constructor(
    private readonly campaignService: CampaignService,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncCampaignsCron(): Promise<void> {
    await this.syncCampaigns();
  }

  async syncCampaigns(): Promise<number> {
    const campaigns = await this.campaignService.getCampaigns();
    let synced = 0;

    for (const item of campaigns) {
      const existing = await this.campaignRepository.findOneBy({
        address: item.address,
        chainId: item.chainId,
      });

      const mapped = {
        name: item.address,
        address: item.address,
        chainId: item.chainId,
        pair: item.symbol,
        exchange: item.exchangeName,
        rewardToken: item.token,
        startTime: new Date(Math.max(0, item.startBlock) * 1000),
        endTime: new Date(Math.max(0, item.endBlock) * 1000),
        status: this.mapStatus(item.status),
        totalReward: new BigNumber(item.totalFundedAmount || 0).toNumber(),
        type: item.type,
        updatedAt: new Date(getRFC3339Timestamp()),
      };

      if (existing) {
        await this.campaignRepository.save({ ...existing, ...mapped });
      } else {
        await this.campaignRepository.save(
          this.campaignRepository.create(mapped as any),
        );
      }
      synced += 1;
    }

    return synced;
  }

  private mapStatus(remoteStatus: string): string {
    const normalized = (remoteStatus || '').toLowerCase();

    if (normalized.includes('running') || normalized.includes('active')) {
      return 'active';
    }
    if (normalized.includes('complete') || normalized.includes('finished')) {
      return 'completed';
    }
    if (normalized.includes('payout')) {
      return 'payout';
    }

    return 'cancelled';
  }
}
