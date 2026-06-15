import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminOrdersService } from './admin-orders.service';

@ApiTags('Admin/Orders')
@ApiBearerAuth()
@Controller('admin/orders')
@UseGuards(JwtAuthGuard)
export class AdminOrdersController {
  constructor(private readonly ordersService: AdminOrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'List bounded authenticated tracked admin orders',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Tracked order status. Omit or use all for all statuses.',
  })
  @ApiQuery({
    name: 'side',
    required: false,
    enum: ['buy', 'sell'],
    description: 'Order side. Omit or use all for both sides.',
  })
  @ApiQuery({
    name: 'query',
    required: false,
    description:
      'Case-insensitive bounded search over order, pair, exchange, and strategy fields.',
  })
  @ApiQuery({
    name: 'userOrderId',
    required: false,
    description:
      'Exact user (market-making) order id to scope exchange orders to a single user order.',
  })
  @ApiQuery({
    name: 'strategyKey',
    required: false,
    description:
      'Exact strategy key to scope exchange orders to a single direct order (all account legs).',
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
  async listOrders(
    @Query('status') status?: string,
    @Query('side') side?: string,
    @Query('query') query?: string,
    @Query('userOrderId') userOrderId?: string,
    @Query('strategyKey') strategyKey?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return await this.ordersService.listOrders({
      status,
      side,
      query,
      userOrderId,
      strategyKey,
      limit,
      page,
    });
  }
}
