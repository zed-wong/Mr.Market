/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Ensure it's extracting from Bearer token
      ignoreExpiration: false, // Token should not be expired
      secretOrKey: configService.get<string>('admin.jwt_secret'),
    });
  }

  async validate(payload: any) {
    if (payload?.username === 'admin') {
      await this.authService.assertAdminTokenVersion(payload.tokenVersion);
    }

    // This method is called once the JWT is verified
    return {
      userId: payload.sub,
      username: payload.username,
      tokenVersion: payload.tokenVersion,
      authMethod: payload.authMethod,
    };
  }
}
