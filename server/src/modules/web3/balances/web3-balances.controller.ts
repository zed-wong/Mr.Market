import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';

import { Web3BalancesService } from './web3-balances.service';

type AuthenticatedRequest = {
  user?: {
    userId?: string;
  };
};

@ApiTags('Web3 Balances')
@Controller('web3')
export class Web3BalancesController {
  constructor(private readonly web3BalancesService: Web3BalancesService) {}

  @Get('balances')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get authenticated wallet and market-making balances',
  })
  async getBalances(@Req() request: AuthenticatedRequest) {
    return await this.web3BalancesService.getBalances(
      this.getAuthenticatedUserId(request),
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
