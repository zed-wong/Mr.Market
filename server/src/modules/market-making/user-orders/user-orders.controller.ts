import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';

import { UserOrdersService } from './user-orders.service';

class CreateMarketMakingIntentBody {
  @ApiProperty({
    description: 'User ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  userId: string;

  @ApiProperty({
    description: 'Market making pair ID',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  marketMakingPairId: string;

  @ApiProperty({
    description: 'Strategy definition ID',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  strategyDefinitionId: string;

  @ApiProperty({
    description:
      'Optional user-supplied config overrides for the selected strategy',
    required: false,
    type: 'object',
    additionalProperties: true,
  })
  configOverrides?: Record<string, unknown>;
}

@ApiTags('Trading Engine')
@Controller('user-orders')
export class UserOrdersController {
  constructor(private readonly userOrdersService: UserOrdersService) {}

  @Get('/all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all strategy by user' })
  @ApiQuery({ name: 'userId', type: String, description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'All strategies of user.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getAllStrategy(@Query('userId') userId: string) {
    return await this.userOrdersService.findAllStrategyByUser(userId);
  }

  @Get('/payment-state/market-making/:order_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get payment state by id' })
  @ApiResponse({
    status: 200,
    description: 'The payment state of order.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getMarketMakingPaymentState(@Param('order_id') orderId: string) {
    return await this.userOrdersService.findMarketMakingPaymentStateById(
      orderId,
    );
  }

  @Get('/simply-grow/all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all simply grow orders by user' })
  @ApiQuery({ name: 'userId', type: String, description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'All simply grow orders of user.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getSimplyGrowByUserId(@Query('user_id') userId: string) {
    return await this.userOrdersService.findSimplyGrowByUserId(userId);
  }

  @Get('/simply-grow/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get simply grow order by id' })
  @ApiQuery({ name: 'id', type: String, description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'The details of the simply grow order.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getSimplyGrowByOrderId(@Param('id') id: string) {
    return await this.userOrdersService.findSimplyGrowByOrderId(id);
  }

  @Get('/market-making/all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all market making by user' })
  @ApiQuery({ name: 'userId', type: String, description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'All market making order of user.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getAllMarketMakingByUser(@Query('userId') userId: string) {
    return await this.userOrdersService.findMarketMakingByUserId(userId);
  }

  @Get('/market-making/strategies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get enabled market making strategies configured by admin',
  })
  @ApiResponse({
    status: 200,
    description: 'Enabled strategy definitions available for MM order intent.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getEnabledMarketMakingStrategies() {
    return await this.userOrdersService.listEnabledMarketMakingStrategies();
  }

  @Get('/market-making/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all market making by user' })
  @ApiQuery({ name: 'userId', type: String, description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'The details of the market making.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getMarketMakingDetailsById(@Param('id') id: string) {
    return await this.userOrdersService.findPublicMarketMakingByOrderId(id);
  }

  @Post('/market-making/intent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create market making order intent' })
  @ApiBody({ type: CreateMarketMakingIntentBody })
  @ApiResponse({
    status: 200,
    description: 'Market making order intent created.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async createMarketMakingIntent(@Body() body: CreateMarketMakingIntentBody) {
    return await this.userOrdersService.createMarketMakingOrderIntent(body);
  }

  @Get('/market-making/history/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all market making history by user' })
  @ApiResponse({
    status: 200,
    description: 'All market making history of user',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getUserOrders(
    @Param('userId') userId: string,
  ): Promise<StrategyExecutionHistory[]> {
    return await this.userOrdersService.getUserOrders(userId);
  }

  // @Get('/market-making/history/instance/:id')
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Get market making history by strategy instance id' })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Market making history of strategy instance',
  // })
  // @ApiResponse({ status: 400, description: 'Bad request.' })
  // async getMarketMakingHistoryByInstanceId(
  //   @Param('id') id: string,
  // ): Promise<MarketMakingHistory[]> {
  //   return await this.userOrdersService.getMarketMakingHistoryByStrategyInstanceId(
  //     id,
  //   );
  // }
}
