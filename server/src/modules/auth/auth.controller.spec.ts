import {
  ExecutionContext,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

const JWT_SECRET = 'route-level-session-audit-secret';

describe('AuthController guarded routes', () => {
  let authService: {
    assertAdminTokenVersion: jest.Mock;
    getSession: jest.Mock;
    validateUser: jest.Mock;
    logout: jest.Mock;
    updateAdminPassword: jest.Mock;
    listPasskeys: jest.Mock;
    deletePasskey: jest.Mock;
    generatePasskeyRegistrationOptions: jest.Mock;
    verifyPasskeyRegistration: jest.Mock;
    generatePasskeyLoginOptions: jest.Mock;
    verifyPasskeyLogin: jest.Mock;
    mixinOauthHandler: jest.Mock;
  };
  let auditLogService: { record: jest.Mock };
  let parentCanActivateSpy: jest.SpyInstance;

  beforeEach(async () => {
    authService = {
      assertAdminTokenVersion: jest.fn(async () => undefined),
      getSession: jest.fn(async () => ({
        authenticated: true,
        username: 'admin',
      })),
      validateUser: jest.fn(),
      logout: jest.fn(),
      updateAdminPassword: jest.fn(),
      listPasskeys: jest.fn(),
      deletePasskey: jest.fn(),
      generatePasskeyRegistrationOptions: jest.fn(),
      verifyPasskeyRegistration: jest.fn(),
      generatePasskeyLoginOptions: jest.fn(),
      verifyPasskeyLogin: jest.fn(),
      mixinOauthHandler: jest.fn(),
    };
    auditLogService = {
      record: jest.fn(async () => undefined),
    };
    parentCanActivateSpy = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockRejectedValue(new UnauthorizedException('Unauthorized'));
  });

  afterEach(() => {
    parentCanActivateSpy.mockRestore();
  });

  it('audits missing-token /auth/session denials before session service logic runs', async () => {
    const guard = new JwtAuthGuard(auditLogService as never);

    await expect(
      guard.canActivate(
        createHttpContext({ method: 'GET', path: '/auth/session' }),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(authService.getSession).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'anonymous',
        action: 'admin.session.denied',
        resource: 'auth',
        status: 'denied',
        metadata: expect.objectContaining({ reason: 'guard_denied' }),
        requestContext: expect.objectContaining({
          method: 'GET',
          path: '/auth/session',
          source: 'jwt-auth-guard',
        }),
      }),
    );
  });

  it('audits stale-token /auth/session denials without recording bearer tokens', async () => {
    authService.assertAdminTokenVersion.mockRejectedValueOnce(
      new UnauthorizedException('Invalid admin token'),
    );
    const token = 'secret-bearer-token';
    const strategy = new JwtStrategy(
      {
        get: jest.fn((key: string) =>
          key === 'admin.jwt_secret' ? JWT_SECRET : null,
        ),
      } as unknown as ConfigService,
      authService as unknown as AuthService,
    );
    const guard = new JwtAuthGuard(auditLogService as never);

    await expect(
      strategy.validate({
        userId: 'admin',
        username: 'admin',
        tokenVersion: 999,
        authMethod: 'password',
      }),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      guard.canActivate(
        createHttpContext({
          method: 'GET',
          originalUrl: '/auth/session?token=secret-query-fragment',
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(authService.assertAdminTokenVersion).toHaveBeenCalledWith(999);
    expect(authService.getSession).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'anonymous',
        action: 'admin.session.denied',
        resource: 'auth',
        status: 'denied',
        requestContext: expect.objectContaining({
          method: 'GET',
          path: '/auth/session',
          source: 'jwt-auth-guard',
        }),
      }),
    );
    const auditPayload = JSON.stringify(auditLogService.record.mock.calls);

    expect(auditPayload).not.toContain(token);
    expect(auditPayload).not.toContain('secret-query-fragment');
    expect(auditPayload).not.toContain('Authorization');
  });
});

describe('AuthController web3 logout', () => {
  it('keeps JWT guard metadata and returns HTTP 200 with ok body', async () => {
    const controller = new AuthController({} as AuthService);

    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        AuthController.prototype.web3Logout,
      ),
    ).toBe(HttpStatus.OK);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.web3Logout),
    ).toContain(JwtAuthGuard);
    await expect(controller.web3Logout()).resolves.toEqual({ ok: true });
  });
});

function createHttpContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
