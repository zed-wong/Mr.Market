/* eslint-disable no-console, unused-imports/no-unused-vars */
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { ExchangeInitService } from '../infrastructure/exchange-init/exchange-init.service';
import { Web3Service } from '../web3/web3.service';
import { CampaignService } from './campaign.service';

const debugLog = (...args: unknown[]) => {
  if (process.env.JEST_VERBOSE_LOGS === '1') {
    console.log(...args);
  }
};

/**
 * CampaignService Test Suite
 *
 * Tests the HuFi campaign integration including:
 * - Getting campaigns list
 * - Authentication nonce retrieval
 * - Web3 authentication
 * - Campaign joining
 * - Complete join flow
 */
describe('CampaignService', () => {
  let service: CampaignService;

  // Mock configuration for tests - using real HuFi URLs
  const mockConfig = {
    'hufi.campaign_launcher.api_url': 'https://cl.hu.finance',
    'hufi.recording_oracle.api_url': 'https://ro.hu.finance',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfig[key]),
          },
        },
        {
          provide: Web3Service,
          useValue: {
            getSigner: jest.fn().mockReturnValue({
              getAddress: jest
                .fn()
                .mockResolvedValue(
                  '0x1234567890abcdef1234567890abcdef12345678',
                ),
              privateKey: '0xprivate-key',
            }),
          },
        },
        {
          provide: ExchangeInitService,
          useValue: {
            getExchange: jest.fn().mockResolvedValue({
              apiKey: 'mock-api-key',
              secret: 'mock-secret',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CampaignService>(CampaignService);
  });
  it('joins a market-making campaign with configured signer and read-only exchange credentials', async () => {
    const joinSpy = jest
      .spyOn(service, 'joinCampaignWithAuth')
      .mockResolvedValue({ id: 'join-1' });

    await expect(
      service.joinMarketMakingCampaign({
        chain_id: 137,
        address: '0xabc',
        exchange_name: 'binance',
      }),
    ).resolves.toEqual({ id: 'join-1' });

    expect(joinSpy).toHaveBeenCalledWith(
      '0x1234567890abcdef1234567890abcdef12345678',
      '0xprivate-key',
      'binance',
      'mock-api-key',
      'mock-secret',
      137,
      '0xabc',
    );
  });

  describe('getCampaigns', () => {
    it('signs the same nonce payload shape as hufi-cli', async () => {
      const post = jest.fn().mockResolvedValue({
        data: { access_token: 'token-123' },
      });

      (service as any).hufiRecordingOracleAPI = { post };

      const accessToken = await service.authenticate_web3_user(
        '0x18010af8cdbc0aa92f0d3d38bbde742ef6d265ad',
        'nonce-123',
        '0x59c6995e998f97a5a0044966f094538e0d7d4e1b3f43b4374c1c1ff717a8ba4c',
      );

      expect(accessToken).toBe('token-123');
      expect(post).toHaveBeenNthCalledWith(
        1,
        '/auth',
        expect.objectContaining({
          address: '0x18010af8cdbc0aa92f0d3d38bbde742ef6d265ad',
          signature: expect.any(String),
        }),
      );
    });
  });

  describe('register_exchange_api_key', () => {
    it('registers exchange api key with recording oracle', async () => {
      const post = jest.fn().mockResolvedValue({ data: { id: 'reg-1' } });

      (service as any).hufiRecordingOracleAPI = { post };

      await expect(
        service.register_exchange_api_key(
          'token-123',
          'binance',
          'api-key',
          'api-secret',
        ),
      ).resolves.toEqual({ id: 'reg-1' });

      expect(post).toHaveBeenCalledWith(
        '/exchange-api-keys',
        {
          exchange_name: 'binance',
          api_key: 'api-key',
          secret_key: 'api-secret',
        },
        {
          headers: {
            Authorization: 'Bearer token-123',
          },
        },
      );
    });
  });

  describe('getAccessToken', () => {
    it('runs auth, register exchange api key, then joins campaign', async () => {
      jest.spyOn(service, 'getAccessToken').mockResolvedValue('token-123');
      jest
        .spyOn(service, 'register_exchange_api_key')
        .mockResolvedValue({ id: 'reg-1' });
      jest.spyOn(service, 'join_campaign').mockResolvedValue({ id: 'join-1' });

      await expect(
        service.joinCampaignWithAuth(
          '0x1234567890abcdef1234567890abcdef12345678',
          'private-key',
          'binance',
          'api-key',
          'api-secret',
          137,
          '0x0000000000000000000000000000000000000002',
        ),
      ).resolves.toEqual({ id: 'join-1' });

      expect(service.getAccessToken).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        'private-key',
      );
      expect(service.register_exchange_api_key).toHaveBeenCalledWith(
        'token-123',
        'binance',
        'api-key',
        'api-secret',
        undefined,
      );
      expect(service.join_campaign).toHaveBeenCalledWith(
        'token-123',
        137,
        '0x0000000000000000000000000000000000000002',
      );
    });
  });
});
