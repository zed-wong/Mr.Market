import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminUserOrdersService } from './admin-user-orders.service';

@ApiTags('Admin/UserOrders')
@ApiBearerAuth()
@Controller('admin/user-orders')
@UseGuards(JwtAuthGuard)
export class AdminUserOrdersController {
  constructor(private readonly userOrdersService: AdminUserOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List bounded authenticated user order intents' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['market_making', 'simply_grow'],
    description: 'User order type. Omit or use all for all types.',
  })
  @ApiQuery({
    name: 'state',
    required: false,
    description: 'Case-insensitive exact user order state filter.',
  })
  @ApiQuery({
    name: 'query',
    required: false,
    description:
      'Case-insensitive bounded search over order, user, pair, exchange, source, and asset fields.',
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
  async listUserOrders(
    @Query('type') type?: string,
    @Query('state') state?: string,
    @Query('query') query?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return await this.userOrdersService.listUserOrders({
      type,
      state,
      query,
      limit,
      page,
    });
  }
}
