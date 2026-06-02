import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';

import { Web3DepositService } from '../deposit/web3-deposit.service';
import { Web3FundingService } from './web3-funding.service';

type AuthenticatedRequest = {
  user?: {
    userId?: string;
    address?: string;
  };
};

@ApiTags('Web3 Funding')
@Controller('web3/funding-requests')
export class Web3FundingController {
  constructor(
    private readonly web3FundingService: Web3FundingService,
    private readonly web3DepositService: Web3DepositService,
  ) {}

  @Get('instructions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get Router funding token and receiver instructions',
  })
  getInstructions(@Query('chainId') chainId?: string) {
    return this.web3DepositService.getInstructions(chainId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Prepare a Router funding request for a future market-making order',
  })
  async createFundingRequest(
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    const authenticatedUser = this.getAuthenticatedUser(request);

    return await this.web3FundingService.createFundingRequest(
      authenticatedUser.userId,
      authenticatedUser.address,
      body,
    );
  }

  @Get(':requestId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get authenticated Router funding request status' })
  async getFundingRequest(
    @Param('requestId') requestId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.web3FundingService.getFundingRequest(
      this.getAuthenticatedUser(request).userId,
      requestId,
    );
  }

  @Post(':requestId/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify a Router funding transaction and process its FundsRouted event',
  })
  async verifyFundingTransaction(
    @Param('requestId') requestId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.web3FundingService.verifyFundingTransaction(
      this.getAuthenticatedUser(request).userId,
      requestId,
      body,
    );
  }

  private getAuthenticatedUser(request: AuthenticatedRequest): {
    userId: string;
    address: string;
  } {
    const userId = request.user?.userId;
    const address = request.user?.address;

    if (!userId || !address) {
      throw new UnauthorizedException('Authenticated web3 user not found');
    }

    return { userId, address };
  }
}
