import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AdminAuditLogService } from 'src/modules/admin/system/admin-audit-log.service';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';

const JWT_SECRET = 'route-level-session-audit-secret';

describe('AuthController guarded routes', () => {
  let app: INestApplication;
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

    const module: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [AuthController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: AdminAuditLogService,
          useValue: auditLogService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'admin.jwt_secret' ? JWT_SECRET : null,
            ),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('audits missing-token /auth/session denials before session service logic runs', async () => {
    await request(app.getHttpServer()).get('/auth/session').expect(401);

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
    const token = new JwtService({ secret: JWT_SECRET }).sign({
      username: 'admin',
      tokenVersion: 999,
      authMethod: 'password',
    });

    await request(app.getHttpServer())
      .get('/auth/session?token=secret-query-fragment')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

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
