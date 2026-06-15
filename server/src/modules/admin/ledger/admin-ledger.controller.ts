import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminLedgerService } from './admin-ledger.service';

@ApiTags('Admin/Ledger')
@ApiBearerAuth()
@Controller('admin/ledger')
@UseGuards(JwtAuthGuard)
export class AdminLedgerController {
  constructor(private readonly ledgerService: AdminLedgerService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Internal ledger status: entry counts, health, and balances',
  })
  async getSummary() {
    return await this.ledgerService.getSummary();
  }

  @Get('entries')
  @ApiOperation({
    summary: 'List bounded immutable ledger journal entries',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Ledger entry type. Omit or use all for every type.',
  })
  @ApiQuery({
    name: 'asset',
    required: false,
    description: 'Ledger asset identifier. Omit or use all for all assets.',
  })
  @ApiQuery({
    name: 'query',
    required: false,
    description:
      'Case-insensitive bounded search over entry, order, asset, and ref fields.',
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
  async listEntries(
    @Query('type') type?: string,
    @Query('asset') asset?: string,
    @Query('query') query?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return await this.ledgerService.listEntries({
      type,
      asset,
      query,
      limit,
      page,
    });
  }

  @Get('balances')
  @ApiOperation({
    summary: 'List bounded order-scoped projected ledger balances',
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
  async listBalances(
    @Query('exchange') exchange?: string,
    @Query('asset') asset?: string,
    @Query('query') query?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return await this.ledgerService.listBalances({
      exchange,
      asset,
      query,
      limit,
      page,
    });
  }
}
