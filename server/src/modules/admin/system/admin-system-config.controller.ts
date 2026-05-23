import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminSystemConfigService } from './admin-system-config.service';

@ApiTags('Admin/System')
@ApiBearerAuth()
@Controller('admin/system')
@UseGuards(JwtAuthGuard)
@UseInterceptors(AdminAuditInterceptor)
export class AdminSystemConfigController {
  constructor(private readonly configService: AdminSystemConfigService) {}

  @Get('config')
  @ApiOperation({
    summary: 'Get authenticated allowlisted safe system configuration metadata',
  })
  async getConfig() {
    return await this.configService.getConfig();
  }

  @Patch('config')
  @ApiOperation({
    summary: 'Update one allowlisted mutable system configuration value',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'value'],
      properties: {
        key: { type: 'string' },
        value: {
          oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
        },
      },
    },
  })
  async updateConfig(@Body() payload: unknown) {
    return await this.configService.updateConfig(payload);
  }

  @Post('config/reset')
  @ApiOperation({
    summary: 'Reset one allowlisted mutable system configuration value',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['key'],
      properties: {
        key: { type: 'string' },
      },
    },
  })
  async resetConfig(@Body() payload: unknown) {
    return await this.configService.resetConfig(payload);
  }
}
