import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';

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

  private getAuthenticatedUserId(request: {
    user?: { userId?: string };
  }): string {
    const userId = request.user?.userId;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return userId;
  }

  @Get('/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all strategy by user' })
  @ApiResponse({
    status: 200,
    description: 'All strategies of user.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getAllStrategy(@Req() request: { user?: { userId?: string } }) {
    return await this.userOrdersService.findAllStrategyByUser(
      this.getAuthenticatedUserId(request),
    );
  }

  @Get('/payment-state/market-making/:order_id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get payment state by id' })
  @ApiResponse({
    status: 200,
    description: 'The payment state of order.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getMarketMakingPaymentState(
    @Param('order_id') orderId: string,
    @Req() request: { user?: { userId?: string } },
  ) {
    return await this.userOrdersService.findOwnedMarketMakingPaymentStateById(
      this.getAuthenticatedUserId(request),
      orderId,
    );
  }

  @Get('/simply-grow/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all simply grow orders by user' })
  @ApiResponse({
    status: 200,
    description: 'All simply grow orders of user.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getSimplyGrowByUserId(@Req() request: { user?: { userId?: string } }) {
    return await this.userOrdersService.findSimplyGrowByUserId(
      this.getAuthenticatedUserId(request),
    );
  }

  @Get('/simply-grow/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get simply grow order by id' })
  @ApiQuery({ name: 'id', type: String, description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'The details of the simply grow order.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getSimplyGrowByOrderId(
    @Param('id') id: string,
    @Req() request: { user?: { userId?: string } },
  ) {
    return await this.userOrdersService.findOwnedSimplyGrowByOrderId(
      this.getAuthenticatedUserId(request),
      id,
    );
  }

  @Get('/market-making/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all market making by user' })
  @ApiResponse({
    status: 200,
    description: 'All market making order of user.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getAllMarketMakingByUser(
    @Req() request: { user?: { userId?: string } },
  ) {
    return await this.userOrdersService.findMarketMakingByUserId(
      this.getAuthenticatedUserId(request),
    );
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all market making by user' })
  @ApiResponse({
    status: 200,
    description: 'The details of the market making.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getMarketMakingDetailsById(
    @Param('id') id: string,
    @Req() request: { user?: { userId?: string } },
  ) {
    return await this.userOrdersService.findOwnedMarketMakingByOrderId(
      this.getAuthenticatedUserId(request),
      id,
    );
  }

  @Post('/market-making/intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create market making order intent' })
  @ApiBody({ type: CreateMarketMakingIntentBody })
  @ApiResponse({
    status: 200,
    description: 'Market making order intent created.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async createMarketMakingIntent(
    @Body() body: CreateMarketMakingIntentBody,
    @Req() request: { user?: { userId?: string } },
  ) {
    return await this.userOrdersService.createMarketMakingOrderIntent({
      ...body,
      userId: this.getAuthenticatedUserId(request),
    });
  }

  @Get('/market-making/history/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all market making history by user' })
  @ApiResponse({
    status: 200,
    description: 'All market making history of user',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async getUserOrders(
    @Req() request: { user?: { userId?: string } },
  ): Promise<StrategyExecutionHistory[]> {
    return await this.userOrdersService.getUserOrders(
      this.getAuthenticatedUserId(request),
    );
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
