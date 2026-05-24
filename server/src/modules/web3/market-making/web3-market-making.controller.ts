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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';

import { Web3MarketMakingService } from './web3-market-making.service';

type AuthenticatedRequest = {
  user?: {
    userId?: string;
  };
};

@ApiTags('Web3 Market Making')
@Controller('api/v1/web3/market-making')
export class Web3MarketMakingController {
  constructor(
    private readonly web3MarketMakingService: Web3MarketMakingService,
  ) {}

  @Get('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List authenticated user market-making orders' })
  async listOrders(@Req() request: AuthenticatedRequest) {
    return await this.web3MarketMakingService.listOrders(
      this.getAuthenticatedUserId(request),
    );
  }

  @Get('orders/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get authenticated user market-making order detail' })
  async getOrderDetail(
    @Param('orderId') orderId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.web3MarketMakingService.getOrderDetail(
      this.getAuthenticatedUserId(request),
      orderId,
    );
  }

  @Get('strategies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List public enabled web3 market-making strategies' })
  async listStrategies() {
    return await this.web3MarketMakingService.listStrategies();
  }

  @Get('options')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List enabled market-making pair/spec options' })
  async listPairOptions() {
    return await this.web3MarketMakingService.listPairOptions();
  }

  @Post('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a web3 market-making order intent' })
  async createOrder(
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.web3MarketMakingService.createOrder(
      this.getAuthenticatedUserId(request),
      body,
    );
  }

  @Post('orders/:orderId/deposit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deposit funds into an owned market-making order' })
  async deposit(
    @Param('orderId') orderId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.web3MarketMakingService.deposit(
      this.getAuthenticatedUserId(request),
      orderId,
      body,
    );
  }

  @Post('orders/:orderId/withdraw')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw available funds from an owned order' })
  async withdraw(
    @Param('orderId') orderId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.web3MarketMakingService.withdraw(
      this.getAuthenticatedUserId(request),
      orderId,
      body,
    );
  }

  @Post('orders/:orderId/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start an owned market-making order' })
  async start(
    @Param('orderId') orderId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.web3MarketMakingService.start(
      this.getAuthenticatedUserId(request),
      orderId,
    );
  }

  @Post('orders/:orderId/pause')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a running owned market-making order' })
  async pause(
    @Param('orderId') orderId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.web3MarketMakingService.pause(
      this.getAuthenticatedUserId(request),
      orderId,
    );
  }

  @Post('orders/:orderId/resume')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused owned market-making order' })
  async resume(
    @Param('orderId') orderId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.web3MarketMakingService.resume(
      this.getAuthenticatedUserId(request),
      orderId,
    );
  }

  private getAuthenticatedUserId(request: AuthenticatedRequest): string {
    const userId = request.user?.userId;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return userId;
  }
}
