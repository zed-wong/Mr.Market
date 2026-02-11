import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CampaignService } from './campaign.service';
import { Web3Module } from '../web3/web3.module';
import { ExchangeInitModule } from '../infrastructure/exchange-init/exchange-init.module';
import { CampaignSyncService } from './campaign-sync.service';
import { Campaign } from 'src/common/entities/campaign.entity';
import { HufiScoreEstimatorService } from './hufi-score-estimator.service';
import { HufiScoreSnapshot } from 'src/common/entities/hufi-score-snapshot.entity';
import { MarketMakingHistory } from 'src/common/entities/market-making-order.entity';

@Module({
  imports: [
    Web3Module,
    ExchangeInitModule,
    TypeOrmModule.forFeature([Campaign, HufiScoreSnapshot, MarketMakingHistory]),
  ],
  providers: [
    CampaignService,
    CampaignSyncService,
    HufiScoreEstimatorService,
  ],
  exports: [CampaignService],
})
export class CampaignModule {}
