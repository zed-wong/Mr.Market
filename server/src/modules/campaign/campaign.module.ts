import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from 'src/common/entities/campaign/campaign.entity';
import { HufiScoreSnapshot } from 'src/common/entities/campaign/hufi-score-snapshot.entity';
import { MarketMakingHistory } from 'src/common/entities/market-making/market-making-order.entity';

import { ExchangeInitModule } from '../infrastructure/exchange-init/exchange-init.module';
import { Web3Module } from '../web3/web3.module';
import { CampaignService } from './campaign.service';
import { CampaignSyncService } from './campaign-sync.service';
import { HufiScoreEstimatorService } from './hufi-score-estimator.service';

@Module({
  imports: [
    Web3Module,
    ExchangeInitModule,
    TypeOrmModule.forFeature([
      Campaign,
      HufiScoreSnapshot,
      MarketMakingHistory,
    ]),
  ],
  providers: [CampaignService, CampaignSyncService, HufiScoreEstimatorService],
  exports: [CampaignService],
})
export class CampaignModule {}
