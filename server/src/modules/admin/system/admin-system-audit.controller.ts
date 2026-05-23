import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminAuditLogService } from './admin-audit-log.service';

@ApiTags('Admin/System')
@ApiBearerAuth()
@Controller('admin/system')
@UseGuards(JwtAuthGuard)
export class AdminSystemAuditController {
  constructor(private readonly auditLogService: AdminAuditLogService) {}

  @Get('audit')
  @ApiOperation({
    summary: 'Get authenticated bounded redacted admin audit records',
  })
  @ApiQuery({
    name: 'actor',
    required: false,
    description: 'Exact actor filter.',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    description: 'Exact audit action filter.',
  })
  @ApiQuery({
    name: 'resource',
    required: false,
    description: 'Exact audited resource filter.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['success', 'denied', 'error'],
    description: 'Optional audit status filter.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Inclusive RFC3339 lower timestamp bound.',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Inclusive RFC3339 upper timestamp bound.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Record count. Defaults to 50 and is capped at 200.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Positive page number. Defaults to 1.',
  })
  @ApiQuery({
    name: 'export',
    required: false,
    description:
      'When true, includes a bounded NDJSON export generated from the same redacted records.',
  })
  @ApiQuery({
    name: 'integrity',
    required: false,
    description:
      'When true, includes bounded read-only content-hash verification for returned records.',
  })
  async getAudit(
    @Query('actor') actor?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('export') exportAudit?: string,
    @Query('integrity') integrity?: string,
  ) {
    return await this.auditLogService.getAudit({
      actor,
      action,
      resource,
      status,
      from,
      to,
      limit,
      page,
      export: exportAudit,
      integrity,
    });
  }
}
