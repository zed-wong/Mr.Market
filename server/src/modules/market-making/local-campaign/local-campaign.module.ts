import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from 'src/common/entities/campaign/campaign.entity';
import { CampaignParticipation } from 'src/common/entities/campaign/campaign-participation.entity';

import { LocalCampaignController } from './local-campaign.controller';
import { LocalCampaignProcessor } from './local-campaign.processor';
import { LocalCampaignService } from './local-campaign.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, CampaignParticipation]),
    BullModule.registerQueue({
      name: 'local-campaigns',
    }),
  ],
  controllers: [LocalCampaignController],
  providers: [LocalCampaignService, LocalCampaignProcessor],
  exports: [LocalCampaignService],
})
export class LocalCampaignModule {}
