import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminDashboardService } from './admin-dashboard.service';

@ApiTags('Admin/Dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get bounded authenticated dashboard summary' })
  @ApiQuery({
    name: 'range',
    required: false,
    enum: ['24h', '7d', '30d'],
    description: 'Summary time range. Defaults to 24h.',
  })
  async getSummary(@Query('range') range?: unknown) {
    return await this.dashboardService.getSummary(range);
  }
}
