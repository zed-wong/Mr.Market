import { forwardRef, Module } from '@nestjs/common';

import { ExchangeInitModule } from '../infrastructure/exchange-init/exchange-init.module';
import { Web3Module } from '../web3/web3.module';
import { CampaignService } from './campaign.service';

@Module({
  imports: [forwardRef(() => Web3Module), ExchangeInitModule],
  providers: [CampaignService],
  exports: [CampaignService],
})
export class CampaignModule {}
