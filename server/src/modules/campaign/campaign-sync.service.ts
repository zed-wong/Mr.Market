/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { Campaign } from 'src/common/entities/campaign/campaign.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { CampaignService } from './campaign.service';

@Injectable()
export class CampaignSyncService {
  private readonly logger = new CustomLogger(CampaignSyncService.name);

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
      try {
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
          startTime: this.toSafeDate(item.startBlock),
          endTime: this.toSafeDate(item.endBlock),
          status: this.mapStatus(item.status),
          totalReward: this.toSafeNumber(item.totalFundedAmount),
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
      } catch (error) {
        this.logger.error(
          `Failed syncing campaign ${String(
            item?.address || 'unknown',
          )} on chain ${String(item?.chainId || 'unknown')}: ${error.message}`,
        );
        continue;
      }
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

  private toSafeDate(unixSeconds: unknown): Date {
    const parsed = Number(unixSeconds);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return new Date(0);
    }

    const milliseconds = Math.trunc(parsed * 1000);

    // Date max/min in JS is +/- 8.64e15 ms.
    if (!Number.isFinite(milliseconds) || Math.abs(milliseconds) > 8.64e15) {
      return new Date(0);
    }

    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) {
      return new Date(0);
    }

    return date;
  }

  private toSafeNumber(value: unknown): number {
    // BigNumber ctor doesn't accept unknown, so normalize first.
    const normalized: string | number =
      typeof value === 'number' || typeof value === 'string' ? value : 0;
    const parsed = new BigNumber(normalized);

    if (!parsed.isFinite()) {
      return 0;
    }

    const asNumber = parsed.toNumber();

    if (!Number.isFinite(asNumber) || asNumber < 0) {
      return 0;
    }

    return asNumber;
  }
}
