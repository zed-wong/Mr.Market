import { Process, Processor } from '@nestjs/bull';
import BigNumber from 'bignumber.js';
import { Job } from 'bull';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { LocalCampaignService } from './local-campaign.service';

@Processor('local-campaigns')
export class LocalCampaignProcessor {
  private readonly logger = new CustomLogger(LocalCampaignProcessor.name);

  constructor(private readonly campaignService: LocalCampaignService) {}

  @Process('check_campaign_status')
  async handleCheckCampaignStatus(job: Job<{ campaignId: string }>) {
    const { campaignId } = job.data;

    this.logger.log(`Checking campaign status for ${campaignId}`);

    const campaign = await this.campaignService.findById(campaignId);

    if (!campaign) {
      this.logger.error(`Campaign ${campaignId} not found`);

      return;
    }

    // Check if campaign has ended
    if (new Date() > campaign.endTime && campaign.status === 'active') {
      this.logger.log(`Campaign ${campaignId} ended. Distributing rewards...`);
      await this.campaignService.updateCampaign(campaignId, {
        status: 'completed',
      });

      // Trigger reward distribution
      await this.distributeRewards(campaignId);
    }
  }

  private async distributeRewards(campaignId: string) {
    const campaign = await this.campaignService.findById(campaignId);
    const participations = await this.campaignService.getParticipations(
      campaignId,
    );

    if (participations.length === 0) {
      this.logger.warn(`No participants for campaign ${campaignId}`);

      return;
    }

    const totalContribution = participations.reduce(
      (sum, p) => sum.plus(p.contributionAmount ?? 0),
      new BigNumber(0),
    );

    if (totalContribution.isZero()) {
      this.logger.warn(`Total contribution is 0 for campaign ${campaignId}`);

      return;
    }

    for (const p of participations) {
      const contribution = new BigNumber(p.contributionAmount ?? 0);
      const share = contribution.dividedBy(totalContribution);
      const reward = share.multipliedBy(campaign.totalReward ?? 0);

      await this.campaignService.updateParticipation(p.id, {
        rewardAmount: reward.toNumber(),
        status: 'rewarded',
      });

      this.logger.log(
        `Rewarded user ${p.userId} with ${reward.toString()} ${
          campaign.rewardToken
        }`,
      );
    }
  }
}
