import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminSystemLogsService } from './admin-system-logs.service';

@ApiTags('Admin/System')
@ApiBearerAuth()
@Controller('admin/system')
@UseGuards(JwtAuthGuard)
export class AdminSystemLogsController {
  constructor(private readonly logsService: AdminSystemLogsService) {}

  @Get('logs')
  @ApiOperation({
    summary: 'Get authenticated bounded redacted system logs',
  })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: ['combined', 'error', 'all'],
    description: 'Approved logical log source. Defaults to combined.',
  })
  @ApiQuery({
    name: 'level',
    required: false,
    enum: ['error', 'warn', 'info', 'debug'],
    description: 'Optional log level filter.',
  })
  @ApiQuery({
    name: 'query',
    required: false,
    description: 'Bounded case-insensitive search over redacted log entries.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Entry count. Defaults to 100 and is capped at 200.',
  })
  @ApiQuery({
    name: 'export',
    required: false,
    description:
      'When true, includes a bounded text export generated from the same redacted entries.',
  })
  async getLogs(
    @Query('source') source?: string,
    @Query('level') level?: string,
    @Query('query') query?: string,
    @Query('limit') limit?: string,
    @Query('export') exportLogs?: string,
  ) {
    return await this.logsService.getLogs({
      source,
      level,
      query,
      limit,
      export: exportLogs,
    });
  }
}
