import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';

import { Web3DepositService } from './web3-deposit.service';

type AuthenticatedRequest = {
  user?: {
    userId?: string;
    address?: string;
  };
};

@ApiTags('Web3 Deposit')
@Controller('web3/deposit')
export class Web3DepositController {
  constructor(private readonly web3DepositService: Web3DepositService) {}

  @Get('instructions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get chain-specific EVM deposit receiving instructions',
  })
  getInstructions(@Query('chainId') chainId?: string) {
    return this.web3DepositService.getInstructions(chainId);
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify an EVM deposit transaction and credit the user ledger',
  })
  async verifyDeposit(
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    const authenticatedUser = this.getAuthenticatedUser(request);

    return await this.web3DepositService.verifyDeposit(
      authenticatedUser.userId,
      authenticatedUser.address,
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
