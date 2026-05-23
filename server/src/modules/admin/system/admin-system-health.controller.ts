import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminSystemHealthService } from './admin-system-health.service';

@ApiTags('Admin/System')
@ApiBearerAuth()
@Controller('admin/system')
@UseGuards(JwtAuthGuard)
export class AdminSystemHealthController {
  constructor(private readonly healthService: AdminSystemHealthService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Get authenticated read-only system health aggregation',
  })
  @ApiQuery({
    name: 'group',
    required: false,
    description: 'Optional health group filter.',
  })
  @ApiQuery({
    name: 'service',
    required: false,
    description: 'Optional exact service id filter.',
  })
  async getHealth(@Query('group') group?: string, @Query('service') service?: string) {
    return await this.healthService.getHealth({ group, service });
  }
}
