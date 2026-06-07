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

import { Web3WithdrawService } from './web3-withdraw.service';

type AuthenticatedRequest = {
  user?: {
    userId?: string;
    address?: string;
  };
};

@ApiTags('Web3 Withdrawal Requests')
@Controller('web3/withdrawal-requests')
export class Web3WithdrawController {
  constructor(private readonly web3WithdrawService: Web3WithdrawService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prepare an authenticated Router withdrawal request',
  })
  async createWithdrawalRequest(
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    const authenticatedUser = this.getAuthenticatedUser(request);

    return await this.web3WithdrawService.createWithdrawalRequest(
      authenticatedUser.userId,
      authenticatedUser.address,
      body,
    );
  }

  @Get(':withdrawalId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get authenticated Router withdrawal request status',
  })
  async getWithdrawal(
    @Param('withdrawalId') withdrawalId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.web3WithdrawService.getWithdrawal(
      this.getAuthenticatedUser(request).userId,
      withdrawalId,
    );
  }

  @Post(':withdrawalId/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify a Router withdrawal request transaction and process payout',
  })
  async verifyWithdrawalTransaction(
    @Param('withdrawalId') withdrawalId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.web3WithdrawService.verifyWithdrawalTransaction(
      this.getAuthenticatedUser(request).userId,
      withdrawalId,
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
