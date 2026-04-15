import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';

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
export class AdminDirectMarketMakingController {
  constructor(
    private readonly adminDirectMarketMakingService: AdminDirectMarketMakingService,
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

  @Get('direct-orders/:id/status')
  @ApiOperation({ summary: 'Get runtime status for a direct admin order' })
  async getDirectOrderStatus(@Param('id') id: string) {
    return this.adminDirectMarketMakingService.getDirectOrderStatus(id);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'List available HuFi campaigns' })
  async listCampaigns() {
    return this.adminDirectMarketMakingService.listCampaigns();
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
