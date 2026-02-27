import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Campaign } from 'src/common/entities/campaign/campaign.entity';

import { LocalCampaignService } from './local-campaign.service';

@ApiTags('Campaigns')
@Controller('local-campaigns')
export class LocalCampaignController {
  constructor(private readonly campaignService: LocalCampaignService) {}

  @Post()
  async createCampaign(@Body() data: Partial<Campaign>) {
    return this.campaignService.createCampaign(data);
  }

  @Get(':id')
  async getCampaign(@Param('id') id: string) {
    return this.campaignService.findById(id);
  }
}
