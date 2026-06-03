import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminPositionsService } from './admin-positions.service';

@ApiTags('Admin/Positions')
@ApiBearerAuth()
@Controller('admin/positions')
@UseGuards(JwtAuthGuard)
export class AdminPositionsController {
  constructor(private readonly positionsService: AdminPositionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List bounded authenticated read-only admin positions',
  })
  @ApiQuery({
    name: 'exchange',
    required: false,
    description:
      'Tracked order exchange identifier. Omit or use all for all exchanges.',
  })
  @ApiQuery({
    name: 'asset',
    required: false,
    description: 'Ledger asset identifier. Omit or use all for all assets.',
  })
  @ApiQuery({
    name: 'query',
    required: false,
    description: 'Case-insensitive bounded search over order and asset fields.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size. Defaults to 25 and is capped at 100.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'One-based page number. Defaults to 1.',
  })
  async listPositions(
    @Query('exchange') exchange?: string,
    @Query('asset') asset?: string,
    @Query('query') query?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return await this.positionsService.listPositions({
      exchange,
      asset,
      query,
      limit,
      page,
    });
  }
}
