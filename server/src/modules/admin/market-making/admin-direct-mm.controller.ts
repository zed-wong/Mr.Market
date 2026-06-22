import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { CampaignService } from 'src/modules/campaign/campaign.service';
import { PerformanceService } from 'src/modules/market-making/performance/performance.service';

import { AdminAuditInterceptor } from '../system/admin-audit.interceptor';
import {
  CampaignJoinRequestDto,
  DirectResumeMarketMakingDto,
  DirectStartMarketMakingDto,
  DirectStopMarketMakingDto,
  DirectWalletStatusDto,
} from './admin-direct-mm.dto';
import { AdminDirectMarketMakingService } from './admin-direct-mm.service';

@ApiTags('Admin/Market Making')
@ApiBearerAuth()
@Controller('admin/market-making')
@UseGuards(JwtAuthGuard)
@UseInterceptors(AdminAuditInterceptor)
export class AdminDirectMarketMakingController {
  constructor(
    private readonly adminDirectMarketMakingService: AdminDirectMarketMakingService,
    private readonly performanceService: PerformanceService,
    private readonly campaignService: CampaignService,
  ) {}

  @Post('direct-start')
  @ApiOperation({ summary: 'Start a direct admin market-making order' })
  async directStart(
    @Body() body: DirectStartMarketMakingDto,
    @Req() request: { user?: { userId?: string } },
  ) {
    return this.adminDirectMarketMakingService.directStart(
      body,
      request.user?.userId,
    );
  }

  @Post('direct-stop')
  @ApiOperation({ summary: 'Stop a direct admin market-making order' })
  async directStop(@Body() body: DirectStopMarketMakingDto) {
    return this.adminDirectMarketMakingService.directStop(body.orderId);
  }

  @Post('direct-resume')
  @ApiOperation({ summary: 'Resume a direct admin market-making order' })
  async directResume(@Body() body: DirectResumeMarketMakingDto) {
    return this.adminDirectMarketMakingService.directResume(body.orderId);
  }

  @Delete('direct-orders/:id')
  @ApiOperation({ summary: 'Remove a direct admin market-making order' })
  async removeDirectOrder(@Param('id') id: string) {
    return this.adminDirectMarketMakingService.removeDirectOrder(id);
  }

  @Get('direct-orders')
  @ApiOperation({ summary: 'List direct admin market-making orders' })
  async listDirectOrders() {
    return this.adminDirectMarketMakingService.listDirectOrders();
  }

  @Get('direct-strategies')
  @ApiOperation({
    summary:
      'List admin direct strategy definitions (public + admin visibility)',
  })
  async listDirectStrategies() {
    return this.adminDirectMarketMakingService.listDirectStrategyDefinitions();
  }

  @Get('dex-setup')
  @ApiOperation({
    summary: 'List DEX connector, trading account, and token setup metadata',
  })
  async getDexSetup() {
    return this.adminDirectMarketMakingService.getDexSetup();
  }

  @Get('direct-orders/:id/status')
  @ApiOperation({ summary: 'Get runtime status for a direct admin order' })
  async getDirectOrderStatus(@Param('id') id: string) {
    return this.adminDirectMarketMakingService.getDirectOrderStatus(id);
  }

  @Get('orders/:id/performance')
  @ApiOperation({ summary: 'Get market-making order performance' })
  async getOrderPerformance(@Param('id') id: string) {
    return this.performanceService.getOrderPerformance(id);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'List available HuFi campaigns' })
  async listCampaigns() {
    return this.adminDirectMarketMakingService.listCampaigns();
  }

  @Get('campaigns/:chainId/:address/progress')
  @ApiOperation({ summary: 'Get HuFi campaign progress' })
  async getCampaignProgress(
    @Param('chainId') chainId: string,
    @Param('address') address: string,
  ) {
    return this.campaignService.getCampaignProgress(Number(chainId), address);
  }

  @Get('campaigns/:chainId/:address/leaderboard')
  @ApiOperation({ summary: 'Get HuFi campaign leaderboard' })
  async getCampaignLeaderboard(
    @Param('chainId') chainId: string,
    @Param('address') address: string,
  ) {
    return this.campaignService.getCampaignLeaderboard(
      Number(chainId),
      address,
    );
  }

  @Post('campaign-join')
  @ApiOperation({ summary: 'Join a HuFi campaign through backend proxy' })
  async joinCampaign(@Body() body: CampaignJoinRequestDto) {
    return this.adminDirectMarketMakingService.joinCampaign(body);
  }

  @Get('wallet-status')
  @ApiOperation({
    summary: 'Get server EVM wallet status for admin direct market making',
  })
  async getWalletStatus(): Promise<DirectWalletStatusDto> {
    return this.adminDirectMarketMakingService.getWalletStatus();
  }
}
