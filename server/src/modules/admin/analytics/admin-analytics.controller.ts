import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminAnalyticsService } from './admin-analytics.service';

@ApiTags('Admin/Analytics')
@ApiBearerAuth()
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard)
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AdminAnalyticsService) {}

  @Get('foundation')
  @ApiOperation({
    summary: 'Read PNL, inventory, and risk analytics projection sources',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['admin', 'pair', 'order'],
    description: 'Analytics scope. Defaults to admin.',
  })
  @ApiQuery({
    name: 'orderId',
    required: false,
    description: 'Order identifier required for order scope.',
  })
  @ApiQuery({
    name: 'exchange',
    required: false,
    description: 'Exchange filter required with pair for pair scope.',
  })
  @ApiQuery({
    name: 'pair',
    required: false,
    description: 'Market pair filter required with exchange for pair scope.',
  })
  @ApiQuery({
    name: 'startAt',
    required: false,
    description: 'Custom range start timestamp. Requires endAt.',
  })
  @ApiQuery({
    name: 'endAt',
    required: false,
    description: 'Custom range end timestamp. Requires startAt.',
  })
  @ApiQuery({
    name: 'range',
    required: false,
    enum: ['24h', '7d', '30d'],
    description: 'Preset range used when startAt/endAt are omitted.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Per-source scan limit. Defaults to 100 and is capped at 500.',
  })
  async getFoundation(
    @Query('scope') scope?: unknown,
    @Query('orderId') orderId?: unknown,
    @Query('exchange') exchange?: unknown,
    @Query('pair') pair?: unknown,
    @Query('startAt') startAt?: unknown,
    @Query('endAt') endAt?: unknown,
    @Query('range') range?: unknown,
    @Query('limit') limit?: unknown,
  ) {
    return await this.analyticsService.getFoundation({
      scope,
      orderId,
      exchange,
      pair,
      startAt,
      endAt,
      range,
      limit,
    });
  }
}
