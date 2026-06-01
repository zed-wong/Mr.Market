import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'; // Import Swagger decorators
import { Throttle } from '@nestjs/throttler';
import { AuthService } from 'src/modules/auth/auth.service';

import { JwtAuthGuard } from './jwt-auth.guard';

type AdminJwtRequest = {
  user?: {
    userId?: string;
    username?: string;
    tokenVersion?: number;
    authMethod?: 'password' | 'passkey';
  };
};
type Web3JwtRequest = {
  user?: {
    userId?: string;
    authMethod?: 'web3';
    address?: string;
    chainId?: string;
  };
};

// Add @ApiTags to categorize the endpoint in Swagger
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('web3/nonce')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async web3Nonce(@Body() body: { address?: string; chainId?: string }) {
    return this.authService.getWeb3Nonce(body);
  }

  @Post('web3/login')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async web3Login(
    @Body() body: { message?: string; signature?: string },
  ): Promise<{
    jwt: string;
    userId: string;
    address: string;
    chainId: string;
    expiresIn: number;
  }> {
    return await this.authService.loginWeb3(body);
  }

  @Get('web3/session')
  @UseGuards(JwtAuthGuard)
  async web3Session(@Req() request: Web3JwtRequest) {
    return this.authService.getWeb3Session(request.user);
  }

  @Post('web3/logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async web3Logout() {
    return { ok: true };
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBody({
    description: 'Login with password',
    schema: {
      type: 'object',
      properties: {
        password: {
          type: 'string',
          example: '',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'JWT access token' })
  async login(
    @Body('password') password: string,
  ): Promise<{ access_token: string; expires_in: number }> {
    const access_token = await this.authService.validateUser(password);

    return { access_token, expires_in: 604800 };
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  async session(
    @Req() request: { user?: { username?: string; tokenVersion?: number } },
  ) {
    return this.authService.getSession(request.user);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() request: { user?: { username?: string } }) {
    return this.authService.logout(request.user);
  }

  @Post('password')
  @UseGuards(JwtAuthGuard)
  async updatePassword(
    @Body('password') password: string,
  ): Promise<{ access_token: string; expires_in: number }> {
    const access_token = await this.authService.updateAdminPassword(password);

    return { access_token, expires_in: 604800 };
  }

  @Get('passkeys')
  @UseGuards(JwtAuthGuard)
  async listPasskeys() {
    return this.authService.listPasskeys();
  }

  @Delete('passkeys/:credentialId')
  @UseGuards(JwtAuthGuard)
  async deletePasskey(
    @Param('credentialId') credentialId: string,
    @Req() request: AdminJwtRequest,
  ) {
    return this.authService.deletePasskey(credentialId, request.user);
  }

  @Post('passkeys/register/options')
  @UseGuards(JwtAuthGuard)
  async passkeyRegistrationOptions(@Req() request: AdminJwtRequest) {
    return this.authService.generatePasskeyRegistrationOptions(request.user);
  }

  @Post('passkeys/register/verify')
  @UseGuards(JwtAuthGuard)
  async passkeyRegistrationVerify(
    @Body() body: unknown,
    @Req() request: AdminJwtRequest,
  ) {
    return this.authService.verifyPasskeyRegistration(
      body as never,
      request.user,
    );
  }

  @Post('passkeys/login/options')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async passkeyLoginOptions() {
    return this.authService.generatePasskeyLoginOptions();
  }

  @Post('passkeys/login/verify')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async passkeyLoginVerify(
    @Body() body: unknown,
  ): Promise<{ access_token: string; expires_in: number }> {
    const access_token = await this.authService.verifyPasskeyLogin(
      body as never,
    );

    return { access_token, expires_in: 604800 };
  }

  @Get('oauth')
  @ApiQuery({ name: 'code', required: true, description: 'OAuth code' }) // Define query parameter
  @ApiResponse({ status: 200, description: 'OAuth handler response' })
  async oauth(@Query('code') code: string) {
    return this.authService.mixinOauthHandler(code);
  }
}
