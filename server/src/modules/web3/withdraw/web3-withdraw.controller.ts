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

@ApiTags('Web3 Withdraw')
@Controller('web3')
export class Web3WithdrawController {
  constructor(private readonly web3WithdrawService: Web3WithdrawService) {}

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request an authenticated EVM wallet withdrawal',
  })
  async createWithdrawal(
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    const authenticatedUser = this.getAuthenticatedUser(request);

    return await this.web3WithdrawService.createWithdrawal(
      authenticatedUser.userId,
      authenticatedUser.address,
      body,
    );
  }

  @Get('withdraw/:withdrawalId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get authenticated EVM wallet withdrawal status',
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
