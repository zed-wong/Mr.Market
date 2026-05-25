import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import axios from 'axios';
import { createHash } from 'crypto';
import { MIXIN_OAUTH_URL } from 'src/common/constants/constants';
import { AdminAuthStateEntity } from 'src/common/entities/admin/admin-auth-state.entity';
import { AdminPasskeyCredentialEntity } from 'src/common/entities/admin/admin-passkey-credential.entity';
import { Web3LoginNonceEntity } from 'src/common/entities/auth/web3-login-nonce.entity';
import { getUserMe } from 'src/common/helpers/mixin/user';
import { AdminAuditLogService } from 'src/modules/admin/system/admin-audit-log.service';

import { UserService } from '../mixin/user/user.service';
import { AuthService } from './auth.service';

// Mock axios and getUserMe
jest.mock('axios');
jest.mock('src/common/helpers/mixin/user');
jest.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: jest.fn(),
  generateRegistrationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let jwtService: JwtService;
  let userService: UserService;
  let authStateRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let passkeyRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let web3LoginNonceRepository: {
    create: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let auditLogService: { record: jest.Mock };
  let configValues: Record<string, string | null>;

  beforeEach(async () => {
    // Mock UserService
    const mockUserService = {
      checkAndUpdateUserToken: jest.fn(),
    };

    authStateRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'admin',
        tokenVersion: 1,
        failedLoginAttempts: 0,
      }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    passkeyRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (value) => value),
    };
    web3LoginNonceRepository = {
      create: jest.fn((value) => value),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (value) => value),
    };
    auditLogService = {
      record: jest.fn(async () => undefined),
    };
    configValues = {
      'admin.jwt_secret': 'jwt_secret',
      'admin.pass': 'admin_pass',
      'mixin.app_id': 'test_app_id',
      'mixin.oauth_secret': 'test_oauth_secret',
    };
    (generateRegistrationOptions as jest.Mock).mockResolvedValue({
      challenge: 'registration-challenge',
    });
    (generateAuthenticationOptions as jest.Mock).mockResolvedValue({
      challenge: 'login-challenge',
    });
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 2 },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key] ?? null),
          },
        },
        {
          provide: UserService,
          useValue: mockUserService, // Use the mock service
        },
        {
          provide: getRepositoryToken(AdminAuthStateEntity),
          useValue: authStateRepository,
        },
        {
          provide: getRepositoryToken(AdminPasskeyCredentialEntity),
          useValue: passkeyRepository,
        },
        {
          provide: getRepositoryToken(Web3LoginNonceEntity),
          useValue: web3LoginNonceRepository,
        },
        {
          provide: AdminAuditLogService,
          useValue: auditLogService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    userService = module.get<UserService>(UserService);
  });

  describe('validateUser', () => {
    it('should throw UnauthorizedException if password is not provided', async () => {
      await expect(authService.validateUser('')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if the password is incorrect', async () => {
      const password = 'wrong_password';
      const hashedAdminPassword = createHash('sha256')
        .update('admin_pass')
        .digest('hex');
      const hashIncomingPass = createHash('sha256')
        .update(password)
        .digest('hex');

      expect(hashedAdminPassword).not.toEqual(hashIncomingPass);
      await expect(authService.validateUser(password)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'anonymous',
          action: 'admin.password_login.failed',
          resource: 'auth',
          status: 'denied',
          metadata: expect.objectContaining({ reason: 'invalid_password' }),
        }),
      );
    });

    it('should return a signed JWT if password is correct', async () => {
      const password = 'admin_pass';
      const hashIncomingPass = createHash('sha256')
        .update(password)
        .digest('hex');

      const hashedAdminPassword = createHash('sha256')
        .update(password)
        .digest('hex');

      expect(hashedAdminPassword).toEqual(hashIncomingPass);

      const signSpy = jest
        .spyOn(jwtService, 'sign')
        .mockReturnValue('signed_token');
      const result = await authService.validateUser(hashedAdminPassword);

      expect(signSpy).toHaveBeenCalledWith(
        { username: 'admin', tokenVersion: 1, authMethod: 'password' },
        { expiresIn: '7d' },
      );
      expect(result).toBe('signed_token');
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'admin',
          action: 'admin.password_login.succeeded',
          resource: 'auth',
          status: 'success',
        }),
      );
    });

    it('audits session checks without exposing bearer tokens', async () => {
      await expect(
        authService.getSession({
          username: 'admin',
          tokenVersion: 1,
          authMethod: 'password',
        }),
      ).resolves.toEqual({ authenticated: true, username: 'admin' });

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'admin',
          action: 'admin.session.succeeded',
          resource: 'auth',
          status: 'success',
          requestContext: { source: 'auth-service' },
        }),
      );
    });
  });

  describe('passkeys', () => {
    it('requires a password-authenticated token before registration options are issued', async () => {
      await expect(
        authService.generatePasskeyRegistrationOptions({
          username: 'admin',
          tokenVersion: 1,
          authMethod: 'passkey',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(generateRegistrationOptions).not.toHaveBeenCalled();
    });

    it('generates registration options after password login and stores the challenge', async () => {
      const options = await authService.generatePasskeyRegistrationOptions({
        username: 'admin',
        tokenVersion: 1,
        authMethod: 'password',
      });

      expect(options).toEqual({ challenge: 'registration-challenge' });
      expect(authStateRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          currentChallenge: 'registration-challenge',
        }),
      );
    });

    it('uses CORS origins and derives RP ID when passkey-specific config is absent', async () => {
      configValues['cors.origin'] =
        'https://admin.mrmarket.one, https://ops.mrmarket.one';

      await authService.generatePasskeyRegistrationOptions({
        username: 'admin',
        tokenVersion: 1,
        authMethod: 'password',
      });

      expect(generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'admin.mrmarket.one',
        }),
      );
    });

    it('prefers explicit passkey origin and RP ID over CORS config', async () => {
      configValues['cors.origin'] = 'https://admin.mrmarket.one';
      configValues['admin.passkey_origin'] = 'https://secure.mrmarket.one';
      configValues['admin.passkey_rp_id'] = 'mrmarket.one';
      (verifyRegistrationResponse as jest.Mock).mockResolvedValueOnce({
        verified: false,
      });
      authStateRepository.findOne.mockResolvedValue({
        id: 'admin',
        tokenVersion: 1,
        failedLoginAttempts: 0,
        currentChallenge: 'registration-challenge',
      });

      await expect(
        authService.verifyPasskeyRegistration(
          { response: { transports: [] } } as never,
          {
            username: 'admin',
            tokenVersion: 1,
            authMethod: 'password',
          },
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(verifyRegistrationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedOrigin: ['https://secure.mrmarket.one'],
          expectedRPID: 'mrmarket.one',
        }),
      );
    });

    it('accepts the local admin dev origin when verifying registration', async () => {
      authStateRepository.findOne.mockResolvedValue({
        id: 'admin',
        tokenVersion: 1,
        failedLoginAttempts: 0,
        currentChallenge: 'registration-challenge',
      });
      (verifyRegistrationResponse as jest.Mock).mockResolvedValueOnce({
        verified: false,
      });

      await expect(
        authService.verifyPasskeyRegistration(
          { response: { transports: [] } } as never,
          {
            username: 'admin',
            tokenVersion: 1,
            authMethod: 'password',
          },
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(verifyRegistrationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedOrigin: expect.arrayContaining(['http://localhost:5174']),
        }),
      );
    });

    it('maps passkey registration verification errors to unauthorized responses', async () => {
      authStateRepository.findOne.mockResolvedValue({
        id: 'admin',
        tokenVersion: 1,
        failedLoginAttempts: 0,
        currentChallenge: 'registration-challenge',
      });
      (verifyRegistrationResponse as jest.Mock).mockRejectedValueOnce(
        new Error('Unexpected registration response origin'),
      );

      await expect(
        authService.verifyPasskeyRegistration(
          { response: { transports: [] } } as never,
          {
            username: 'admin',
            tokenVersion: 1,
            authMethod: 'password',
          },
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns a passkey-authenticated JWT after a valid passkey login', async () => {
      authStateRepository.findOne.mockResolvedValue({
        id: 'admin',
        tokenVersion: 3,
        failedLoginAttempts: 0,
        currentChallenge: 'login-challenge',
      });
      passkeyRepository.findOne.mockResolvedValue({
        credentialId: 'credential-id',
        publicKey: Buffer.from('public-key').toString('base64url'),
        counter: 1,
        transports: JSON.stringify(['internal']),
      });
      const signSpy = jest
        .spyOn(jwtService, 'sign')
        .mockReturnValue('passkey_token');

      const result = await authService.verifyPasskeyLogin({
        id: 'credential-id',
      } as never);

      expect(signSpy).toHaveBeenCalledWith(
        { username: 'admin', tokenVersion: 3, authMethod: 'passkey' },
        { expiresIn: '7d' },
      );
      expect(result).toBe('passkey_token');
    });
  });

  describe('web3 login nonce', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    const normalizedAddress = address.toLowerCase();
    const chainId = '1';
    const buildMessage = (nonce: string) =>
      [
        'Mr.Market wants you to sign in with your Ethereum account:',
        normalizedAddress,
        '',
        'Sign in to Mr.Market web3 market-making orders',
        '',
        'URI: https://mr.market/web3',
        'Version: 1',
        `Chain ID: ${chainId}`,
        `Nonce: ${nonce}`,
      ].join('\n');

    it('issues and persists a server nonce for the requested wallet', async () => {
      const result = await authService.getWeb3Nonce({
        address,
        chainId,
      });

      expect(result.nonce).toHaveLength(36);
      expect(web3LoginNonceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce: result.nonce,
          address: normalizedAddress,
          chainId,
          consumedAt: null,
          expiresAt: expect.any(String),
        }),
      );
    });

    it('requires an active issued nonce and consumes it on successful login', async () => {
      const nonce = 'issued-nonce';
      const challenge = {
        nonce,
        address: normalizedAddress,
        chainId,
        domain: 'Mr.Market',
        statement: 'Sign in to Mr.Market web3 market-making orders',
        uri: 'https://mr.market/web3',
        issuedAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        consumedAt: null,
      };

      web3LoginNonceRepository.findOne.mockResolvedValue(challenge);
      jest.spyOn(jwtService, 'sign').mockReturnValue('web3-token');

      const result = await authService.loginWeb3({
        message: buildMessage(nonce),
        signature: 'demo:signature',
      });

      expect(result.jwt).toBe('web3-token');
      expect(result.address).toBe(normalizedAddress);
      expect(web3LoginNonceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce,
          consumedAt: expect.any(String),
        }),
      );
    });

    it('rejects unknown, replayed, expired, and mismatched web3 nonces', async () => {
      await expect(
        authService.loginWeb3({
          message: buildMessage('unknown-nonce'),
          signature: 'demo:signature',
        }),
      ).rejects.toThrow(UnauthorizedException);

      web3LoginNonceRepository.findOne.mockResolvedValueOnce({
        nonce: 'used-nonce',
        address: normalizedAddress,
        chainId,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        consumedAt: new Date().toISOString(),
      });
      await expect(
        authService.loginWeb3({
          message: buildMessage('used-nonce'),
          signature: 'demo:signature',
        }),
      ).rejects.toThrow(UnauthorizedException);

      web3LoginNonceRepository.findOne.mockResolvedValueOnce({
        nonce: 'expired-nonce',
        address: normalizedAddress,
        chainId,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        consumedAt: null,
      });
      await expect(
        authService.loginWeb3({
          message: buildMessage('expired-nonce'),
          signature: 'demo:signature',
        }),
      ).rejects.toThrow(UnauthorizedException);

      web3LoginNonceRepository.findOne.mockResolvedValueOnce({
        nonce: 'wrong-chain',
        address: normalizedAddress,
        chainId: '137',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        consumedAt: null,
      });
      await expect(
        authService.loginWeb3({
          message: buildMessage('wrong-chain'),
          signature: 'demo:signature',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('mixinOauthHandler', () => {
    it('should throw HttpException if code length is not 64', async () => {
      const invalidCode = 'short_code';

      await expect(authService.mixinOauthHandler(invalidCode)).rejects.toThrow(
        HttpException,
      );
    });

    it('should make a POST request to Mixin OAuth URL and return access token', async () => {
      const validCode = 'a'.repeat(64);
      const mockResponse = {
        data: {
          data: { access_token: 'test_access_token' },
        },
      };

      (axios.post as jest.Mock).mockResolvedValueOnce(mockResponse);
      (getUserMe as jest.Mock).mockResolvedValueOnce({ user_id: 'user_id' });

      const checkAndUpdateUserTokenSpy = jest
        .spyOn(userService, 'checkAndUpdateUserToken')
        .mockImplementation(() => Promise.resolve());

      const result = await authService.mixinOauthHandler(validCode);

      // Use the actual MIXIN_OAUTH_URL constant here
      expect(axios.post).toHaveBeenCalledWith(
        MIXIN_OAUTH_URL,
        {
          client_id: 'test_app_id',
          code: validCode,
          client_secret: 'test_oauth_secret',
        },
        { headers: { 'Content-Type': 'application/json' } },
      );

      expect(getUserMe).toHaveBeenCalledWith('test_access_token');
      expect(checkAndUpdateUserTokenSpy).toHaveBeenCalledWith(
        { user_id: 'user_id' },
        'user_id',
        'test_access_token',
      );
      expect(result).toEqual({ token: 'test_access_token' });
    });

    it('should throw HttpException if Mixin OAuth request fails', async () => {
      const validCode = 'a'.repeat(64);

      (axios.post as jest.Mock).mockRejectedValueOnce({
        response: {
          data: { message: 'Request failed' },
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        },
      });

      await expect(authService.mixinOauthHandler(validCode)).rejects.toThrow(
        HttpException,
      );
    });
  });
});
