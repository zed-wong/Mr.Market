import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
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
import { MIXIN_OAUTH_URL } from 'src/common/constants/constants';
import { AdminAuthStateEntity } from 'src/common/entities/admin/admin-auth-state.entity';
import { AdminPasskeyCredentialEntity } from 'src/common/entities/admin/admin-passkey-credential.entity';
import { getUserMe } from 'src/common/helpers/mixin/user';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Repository } from 'typeorm';

import { AdminAuditLogService } from '../admin/system/admin-audit-log.service';
import { UserService } from '../mixin/user/user.service';

const ADMIN_AUTH_ID = 'admin';
const ADMIN_JWT_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const DEFAULT_PASSKEY_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
];

type AdminAuthMethod = 'password' | 'passkey';
type AdminJwtPayload = {
  username?: string;
  tokenVersion?: number;
  authMethod?: AdminAuthMethod;
};

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
    @Optional()
    private readonly auditLogService?: AdminAuditLogService,
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
      await this.audit('admin.password_login.failed', 'denied', {
        reason: 'missing_password',
      });
      throw new UnauthorizedException('Password is required');
    }

    const state = await this.getAdminAuthState();

    if (this.isLocked(state)) {
      await this.audit('admin.password_login.failed', 'denied', {
        reason: 'locked',
      });
      throw new ForbiddenException('Admin login is temporarily locked');
    }

    const hashedAdminPassword = createHash('sha256')
      .update(this.adminPassword)
      .digest('hex');

    const rawPasswordMatches = this.adminPassword === password;
    const legacyHashMatches = hashedAdminPassword === password;

    if (!rawPasswordMatches && !legacyHashMatches) {
      await this.recordFailedLogin(state);
      await this.audit('admin.password_login.failed', 'denied', {
        reason: 'invalid_password',
      });
      throw new UnauthorizedException('Invalid password');
    }

    await this.resetFailedLogins(state);
    await this.audit('admin.password_login.succeeded', 'success');

    return this.signAdminJwt(state.tokenVersion, 'password');
  }

  async getSession(payload?: AdminJwtPayload) {
    if (payload?.username !== ADMIN_AUTH_ID) {
      await this.audit('admin.session.denied', 'denied', {
        reason: 'invalid_actor',
      });
      return { authenticated: false };
    }
    try {
      await this.assertAdminTokenVersion(payload.tokenVersion);
    } catch (error) {
      await this.audit('admin.session.denied', 'denied', {
        reason: 'invalid_token_version',
      });
      throw error;
    }

    await this.audit('admin.session.succeeded', 'success');
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

  async generatePasskeyRegistrationOptions(payload?: AdminJwtPayload) {
    this.assertPasswordAuthenticatedAdmin(payload);
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

  async verifyPasskeyRegistration(
    body: RegistrationResponseJSON,
    payload?: AdminJwtPayload,
  ) {
    this.assertPasswordAuthenticatedAdmin(payload);
    const state = await this.getAdminAuthState();

    if (!state.currentChallenge) {
      throw new UnauthorizedException('Passkey registration challenge missing');
    }

    const verification = await this.verifyPasskeyRegistrationResponse(
      body,
      state.currentChallenge,
    );

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
    await this.audit('admin.passkey_registration.succeeded', 'success');

    return { ok: true };
  }

  async listPasskeys() {
    const credentials = await this.passkeyRepository.find({
      order: { createdAt: 'DESC' },
    });
    return credentials.map((c) => ({
      credentialId: c.credentialId,
      counter: c.counter,
      transports: c.transports ? JSON.parse(c.transports) : [],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async deletePasskey(credentialId: string, payload?: AdminJwtPayload) {
    this.assertPasswordAuthenticatedAdmin(payload);
    const credential = await this.passkeyRepository.findOne({
      where: { credentialId },
    });
    if (!credential) {
      throw new UnauthorizedException('Passkey not found');
    }
    await this.passkeyRepository.delete({ credentialId });
    await this.audit('admin.passkey_revoked', 'success', { credentialId });
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
      await this.audit('admin.passkey_login.failed', 'denied', {
        reason: 'unknown_credential',
      });
      throw new UnauthorizedException('Invalid passkey');
    }

    const verification = await this.verifyPasskeyAuthenticationResponse(
      body,
      state.currentChallenge,
      credential,
    );

    if (!verification.verified) {
      await this.audit('admin.passkey_login.failed', 'denied', {
        reason: 'verification_failed',
      });
      throw new UnauthorizedException('Invalid passkey');
    }

    credential.counter = verification.authenticationInfo.newCounter;
    credential.updatedAt = getRFC3339Timestamp();
    await this.passkeyRepository.save(credential);

    state.currentChallenge = null;
    state.updatedAt = getRFC3339Timestamp();
    await this.adminAuthStateRepository.save(state);
    await this.audit('admin.passkey_login.succeeded', 'success');

    return this.signAdminJwt(state.tokenVersion, 'passkey');
  }

  private signAdminJwt(
    tokenVersion: number,
    authMethod: AdminAuthMethod,
  ): string {
    return this.jwtService.sign(
      { username: ADMIN_AUTH_ID, tokenVersion, authMethod },
      { expiresIn: '7d' },
    );
  }

  private assertPasswordAuthenticatedAdmin(payload?: AdminJwtPayload): void {
    if (
      payload?.username !== ADMIN_AUTH_ID ||
      payload.authMethod !== 'password'
    ) {
      throw new UnauthorizedException(
        'Passkey registration requires password login',
      );
    }
  }

  private async verifyPasskeyRegistrationResponse(
    body: RegistrationResponseJSON,
    currentChallenge: string,
  ) {
    try {
      return await verifyRegistrationResponse({
        response: body,
        expectedChallenge: currentChallenge,
        expectedOrigin: this.getPasskeyOrigins(),
        expectedRPID: this.getPasskeyRpId(),
      });
    } catch (error) {
      await this.audit('admin.passkey_registration.failed', 'denied', {
        reason: 'verification_error',
      });
      this.logger.warn(
        `Passkey registration verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException('Invalid passkey registration');
    }
  }

  private async verifyPasskeyAuthenticationResponse(
    body: AuthenticationResponseJSON,
    currentChallenge: string,
    credential: AdminPasskeyCredentialEntity,
  ) {
    try {
      return await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: currentChallenge,
        expectedOrigin: this.getPasskeyOrigins(),
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
    } catch (error) {
      await this.audit('admin.passkey_login.failed', 'denied', {
        reason: 'verification_error',
      });
      this.logger.warn(
        `Passkey login verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException('Invalid passkey');
    }
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

  private isLocked(state: AdminAuthStateEntity) {
    return Boolean(
      state.lockedUntil && new Date(state.lockedUntil).getTime() > Date.now(),
    );
  }

  private async recordFailedLogin(state: AdminAuthStateEntity) {
    state.failedLoginAttempts += 1;
    if (state.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      state.lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
      await this.incrementTokenVersion('admin.login.locked', state, 'denied');

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
    status: 'success' | 'denied' | 'error' = 'success',
  ) {
    const current = state || (await this.getAdminAuthState());

    current.tokenVersion += 1;
    current.updatedAt = getRFC3339Timestamp();
    await this.adminAuthStateRepository.save(current);
    await this.audit(reason, status);
  }

  private getPasskeyRpName(): string {
    return (
      this.configService.get<string>('admin.passkey_rp_name') ||
      'Mr.Market Admin'
    );
  }

  private getPasskeyRpId(): string {
    const configured = this.configService.get<string>('admin.passkey_rp_id');

    if (configured) {
      return configured;
    }

    return this.getPasskeyOriginHostname(this.getPasskeyOrigins()[0]);
  }

  private getPasskeyOrigins(): string[] {
    const configured =
      this.configService.get<string>('admin.passkey_origin') ||
      this.configService.get<string>('cors.origin');

    if (!configured) {
      return DEFAULT_PASSKEY_ORIGINS;
    }

    const origins = configured
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0 && origin !== '*')
      .filter((origin) => this.isValidOrigin(origin));

    return origins.length > 0 ? origins : DEFAULT_PASSKEY_ORIGINS;
  }

  private getPasskeyOriginHostname(origin: string): string {
    try {
      return new URL(origin).hostname;
    } catch {
      return 'localhost';
    }
  }

  private isValidOrigin(origin: string): boolean {
    try {
      const parsed = new URL(origin);

      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private async audit(
    event: string,
    status: 'success' | 'denied' | 'error' = 'success',
    metadata?: Record<string, unknown>,
  ) {
    this.logger.log(`[admin-audit] ${event}`);

    if (!this.auditLogService) {
      return;
    }

    await this.auditLogService.record({
      actor:
        status === 'denied' ||
        event.includes('.failed') ||
        event.includes('.denied')
          ? 'anonymous'
          : ADMIN_AUTH_ID,
      action: event,
      resource: 'auth',
      status,
      metadata: metadata || null,
      requestContext: {
        source: 'auth-service',
      },
    });
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
