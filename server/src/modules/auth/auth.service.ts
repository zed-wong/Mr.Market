import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types';
import axios from 'axios';
import { createHash } from 'crypto';
import { AdminAuthStateEntity } from 'src/common/entities/admin/admin-auth-state.entity';
import { AdminPasskeyCredentialEntity } from 'src/common/entities/admin/admin-passkey-credential.entity';
import { MIXIN_OAUTH_URL } from 'src/common/constants/constants';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { getUserMe } from 'src/common/helpers/mixin/user';
import { Repository } from 'typeorm';

import { UserService } from '../mixin/user/user.service';

const ADMIN_AUTH_ID = 'admin';
const ADMIN_JWT_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private secret: string;
  private adminPassword: string;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private userService: UserService,
    @InjectRepository(AdminAuthStateEntity)
    private adminAuthStateRepository: Repository<AdminAuthStateEntity>,
    @InjectRepository(AdminPasskeyCredentialEntity)
    private passkeyRepository: Repository<AdminPasskeyCredentialEntity>,
  ) {
    this.secret = this.configService.get<string>('admin.jwt_secret');
    this.adminPassword = this.configService.get<string>('admin.pass');

    if (!this.secret) {
      throw new Error(
        'AuthService initialization failed: JWT secret not found in environment variables',
      );
    }
    if (!this.adminPassword) {
      throw new Error(
        'AuthService initialization failed: Admin password not found in environment variables',
      );
    }

    const mixinOauthSecret =
      this.configService.get<string>('mixin.oauth_secret');

    if (!mixinOauthSecret) {
      this.logger.warn(
        'MIXIN_OAUTH_SECRET is not defined in .env. Mixin login will fail.',
      );
    }
  }

  /**
   * Validates the admin password and returns a signed JWT token.
   * @param password - The password to validate.
   * @returns A signed JWT token.
   * @throws UnauthorizedException - If the password is invalid or missing.
   */
  async validateUser(password: string): Promise<string> {
    if (!password) {
      throw new UnauthorizedException('Password is required');
    }

    const state = await this.getAdminAuthState();
    this.assertNotLocked(state);

    const hashedAdminPassword = createHash('sha256')
      .update(this.adminPassword)
      .digest('hex');

    const rawPasswordMatches = this.adminPassword === password;
    const legacyHashMatches = hashedAdminPassword === password;

    if (!rawPasswordMatches && !legacyHashMatches) {
      await this.recordFailedLogin(state);
      this.audit('admin.password_login.failed');
      throw new UnauthorizedException('Invalid password');
    }

    await this.resetFailedLogins(state);
    this.audit('admin.password_login.succeeded');

    return this.signAdminJwt(state.tokenVersion);
  }

  async getSession(payload?: { username?: string; tokenVersion?: number }) {
    if (payload?.username !== ADMIN_AUTH_ID) {
      return { authenticated: false };
    }
    await this.assertAdminTokenVersion(payload.tokenVersion);
    return { authenticated: true, username: ADMIN_AUTH_ID };
  }

  async logout(payload?: { username?: string }): Promise<{ ok: true }> {
    if (payload?.username === ADMIN_AUTH_ID) {
      await this.incrementTokenVersion('admin.logout');
    }
    return { ok: true };
  }

  async assertAdminTokenVersion(tokenVersion?: number): Promise<void> {
    const state = await this.getAdminAuthState();
    if (!tokenVersion || tokenVersion !== state.tokenVersion) {
      throw new UnauthorizedException('Invalid admin token');
    }
  }

  async generatePasskeyRegistrationOptions() {
    const state = await this.getAdminAuthState();
    const credentials = await this.passkeyRepository.find();
    const options = await generateRegistrationOptions({
      rpName: this.getPasskeyRpName(),
      rpID: this.getPasskeyRpId(),
      userID: Buffer.from(ADMIN_AUTH_ID),
      userName: ADMIN_AUTH_ID,
      userDisplayName: 'Mr.Market Admin',
      attestationType: 'none',
      excludeCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports
          ? JSON.parse(credential.transports)
          : undefined,
      })),
    });

    state.currentChallenge = options.challenge;
    state.updatedAt = getRFC3339Timestamp();
    await this.adminAuthStateRepository.save(state);
    return options;
  }

  async verifyPasskeyRegistration(body: RegistrationResponseJSON) {
    const state = await this.getAdminAuthState();
    if (!state.currentChallenge) {
      throw new UnauthorizedException('Passkey registration challenge missing');
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: state.currentChallenge,
      expectedOrigin: this.getPasskeyOrigin(),
      expectedRPID: this.getPasskeyRpId(),
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new UnauthorizedException('Invalid passkey registration');
    }

    const { credential } = verification.registrationInfo;
    const now = getRFC3339Timestamp();
    await this.passkeyRepository.save({
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: JSON.stringify(body.response.transports || []),
      createdAt: now,
      updatedAt: now,
    });

    state.currentChallenge = null;
    state.updatedAt = now;
    await this.adminAuthStateRepository.save(state);
    this.audit('admin.passkey_registration.succeeded');
    return { ok: true };
  }

  async generatePasskeyLoginOptions() {
    const state = await this.getAdminAuthState();
    const credentials = await this.passkeyRepository.find();
    const options = await generateAuthenticationOptions({
      rpID: this.getPasskeyRpId(),
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports
          ? JSON.parse(credential.transports)
          : undefined,
      })),
      userVerification: 'preferred',
    });

    state.currentChallenge = options.challenge;
    state.updatedAt = getRFC3339Timestamp();
    await this.adminAuthStateRepository.save(state);
    return options;
  }

  async verifyPasskeyLogin(body: AuthenticationResponseJSON): Promise<string> {
    const state = await this.getAdminAuthState();
    if (!state.currentChallenge) {
      throw new UnauthorizedException('Passkey login challenge missing');
    }

    const credential = await this.passkeyRepository.findOne({
      where: { credentialId: body.id },
    });
    if (!credential) {
      this.audit('admin.passkey_login.failed');
      throw new UnauthorizedException('Invalid passkey');
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: state.currentChallenge,
      expectedOrigin: this.getPasskeyOrigin(),
      expectedRPID: this.getPasskeyRpId(),
      credential: {
        id: credential.credentialId,
        publicKey: Buffer.from(credential.publicKey, 'base64url'),
        counter: credential.counter,
        transports: credential.transports
          ? JSON.parse(credential.transports)
          : undefined,
      },
    });

    if (!verification.verified) {
      this.audit('admin.passkey_login.failed');
      throw new UnauthorizedException('Invalid passkey');
    }

    credential.counter = verification.authenticationInfo.newCounter;
    credential.updatedAt = getRFC3339Timestamp();
    await this.passkeyRepository.save(credential);

    state.currentChallenge = null;
    state.updatedAt = getRFC3339Timestamp();
    await this.adminAuthStateRepository.save(state);
    this.audit('admin.passkey_login.succeeded');
    return this.signAdminJwt(state.tokenVersion);
  }

  private signAdminJwt(tokenVersion: number): string {
    return this.jwtService.sign(
      { username: ADMIN_AUTH_ID, tokenVersion },
      { expiresIn: '7d' },
    );
  }

  private async getAdminAuthState(): Promise<AdminAuthStateEntity> {
    let state = await this.adminAuthStateRepository.findOne({
      where: { id: ADMIN_AUTH_ID },
    });
    if (!state) {
      state = this.adminAuthStateRepository.create({
        id: ADMIN_AUTH_ID,
        tokenVersion: 1,
        failedLoginAttempts: 0,
        updatedAt: getRFC3339Timestamp(),
      });
      await this.adminAuthStateRepository.save(state);
    }
    return state;
  }

  private assertNotLocked(state: AdminAuthStateEntity) {
    if (!state.lockedUntil) return;
    if (new Date(state.lockedUntil).getTime() > Date.now()) {
      throw new ForbiddenException('Admin login is temporarily locked');
    }
  }

  private async recordFailedLogin(state: AdminAuthStateEntity) {
    state.failedLoginAttempts += 1;
    if (state.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      state.lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
      await this.incrementTokenVersion('admin.login.locked', state);
      return;
    }
    state.updatedAt = getRFC3339Timestamp();
    await this.adminAuthStateRepository.save(state);
  }

  private async resetFailedLogins(state: AdminAuthStateEntity) {
    state.failedLoginAttempts = 0;
    state.lockedUntil = null;
    state.updatedAt = getRFC3339Timestamp();
    await this.adminAuthStateRepository.save(state);
  }

  private async incrementTokenVersion(
    reason: string,
    state?: AdminAuthStateEntity,
  ) {
    const current = state || (await this.getAdminAuthState());
    current.tokenVersion += 1;
    current.updatedAt = getRFC3339Timestamp();
    await this.adminAuthStateRepository.save(current);
    this.audit(reason);
  }

  private getPasskeyRpName(): string {
    return (
      this.configService.get<string>('admin.passkey_rp_name') ||
      'Mr.Market Admin'
    );
  }

  private getPasskeyRpId(): string {
    return (
      this.configService.get<string>('admin.passkey_rp_id') ||
      'localhost'
    );
  }

  private getPasskeyOrigin(): string {
    return (
      this.configService.get<string>('admin.passkey_origin') ||
      'http://localhost:5173'
    );
  }

  private audit(event: string) {
    this.logger.log(`[admin-audit] ${event}`);
  }

  /**
   * Handles the Mixin OAuth process, retrieves the access token, and updates the user information.
   * @param code - The OAuth code.
   * @returns The access token.
   * @throws HttpException - If the code length is invalid or an HTTP request fails.
   */
  async mixinOauthHandler(code: string) {
    if (code.length !== 64) {
      throw new HttpException('Invalid code length', HttpStatus.BAD_REQUEST);
    }

    const body = {
      client_id: this.configService.get<string>('mixin.app_id'),
      code: code,
      client_secret: this.configService.get<string>('mixin.oauth_secret'),
    };

    try {
      const response = await axios.post(MIXIN_OAUTH_URL, body, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const accessToken = response.data.data.access_token;

      const user = await getUserMe(accessToken);

      if (user) {
        await this.userService.checkAndUpdateUserToken(
          user,
          user.user_id,
          accessToken,
        );
      }

      return { token: accessToken };
    } catch (error) {
      throw new HttpException(
        error.response?.data?.message || 'Failed to fetch Mixin OAuth token',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
