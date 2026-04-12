/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

import { ExchangeInitService } from '../infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from '../infrastructure/logger/logger.service';
import { Web3Service } from '../web3/web3.service';
import { CampaignDataDto, CampaignListResponseDto } from './campaign.dto';

@Injectable()
export class CampaignService {
  private static readonly ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000;
  private readonly logger = new CustomLogger(CampaignService.name);

  private readonly campaignLauncherBaseUrl: string;
  private readonly recordingOracleBaseUrl: string;
  private readonly hufiCampaignLauncherAPI: AxiosInstance;
  private readonly hufiRecordingOracleAPI: AxiosInstance;
  private readonly accessTokenCache = new Map<
    string,
    { token: string; expiresAt: number }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly web3Service: Web3Service,
    private readonly exchangeService: ExchangeInitService,
  ) {
    this.campaignLauncherBaseUrl = this.configService.get<string>(
      'hufi.campaign_launcher.api_url',
    );
    this.recordingOracleBaseUrl = this.configService.get<string>(
      'hufi.recording_oracle.api_url',
    );

    this.hufiCampaignLauncherAPI = axios.create({
      baseURL: this.campaignLauncherBaseUrl,
    });

    this.hufiRecordingOracleAPI = axios.create({
      baseURL: this.recordingOracleBaseUrl,
    });
  }

  async getCampaigns(): Promise<CampaignDataDto[]> {
    this.logger.log('Getting HuFi campaigns');

    try {
      const { data } =
        await this.hufiCampaignLauncherAPI.get<CampaignListResponseDto>(
          '/campaigns?chain_id=137&status=active&limit=100&page=1',
        );

      this.logger.log('Finished getting HuFi campaigns');

      return data.results;
    } catch (error) {
      this.logger.warn(`Error getting HuFi campaigns: ${error.message}`);

      return [];
    }
  }

  /**
   * Function 1: Get Authentication Nonce
   * Retrieve a unique, server-generated nonce string required for Web3 message signing.
   *
   * @param wallet_address - The user's Ethereum wallet address
   * @returns The unique nonce string returned by the API
   * @throws Error if the API request fails
   */
  async get_auth_nonce(wallet_address: string): Promise<string> {
    this.logger.log(
      `Getting authentication nonce for wallet: ${wallet_address}`,
    );

    try {
      const { data } = await this.hufiRecordingOracleAPI.post<{
        nonce: string;
      }>('/auth/nonce', {
        address: wallet_address,
      });

      this.logger.log('Successfully retrieved authentication nonce');

      return data.nonce;
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Unknown error occurred';

      this.logger.warn(
        `Error getting authentication nonce: ${errorMessage}`,
        error.stack,
      );
      throw new Error(`Failed to get authentication nonce: ${errorMessage}`);
    }
  }

  /**
   * Function 2: Web3 Authentication
   * Authenticate the user by verifying a signed message and obtaining an access token.
   *
   * @param wallet_address - The user's Ethereum wallet address
   * @param nonce - The nonce obtained from get_auth_nonce
   * @param private_key - The user's private key (for local signing)
   * @returns The JWT access token returned by the API
   * @throws Error if authentication fails
   */
  async authenticate_web3_user(
    wallet_address: string,
    nonce: string,
    private_key: string,
  ): Promise<string> {
    this.logger.log(`Authenticating Web3 user: ${wallet_address}`);

    try {
      const { Wallet } = await import('ethers');
      const wallet = new Wallet(private_key);
      const signableMessage = JSON.stringify({ nonce });
      const signature = await wallet.signMessage(signableMessage);

      this.logger.log('Nonce signed successfully, requesting access token');

      // Send the signed message to the API for verification
      const { data } = await this.hufiRecordingOracleAPI.post<{
        access_token: string;
      }>('/auth', {
        address: wallet_address,
        signature: signature,
      });

      this.logger.log('Successfully authenticated Web3 user');

      return data.access_token;
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Unknown error occurred';

      this.logger.warn(
        `Error authenticating Web3 user: ${errorMessage}`,
        error.stack,
      );
      throw new Error(`Failed to authenticate Web3 user: ${errorMessage}`);
    }
  }

  invalidateAccessToken(walletAddress: string): void {
    this.accessTokenCache.delete(walletAddress.toLowerCase());
  }

  async getAccessToken(
    walletAddress: string,
    privateKey: string,
  ): Promise<string> {
    const cacheKey = walletAddress.toLowerCase();
    const cached = this.accessTokenCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    const nonce = await this.get_auth_nonce(walletAddress);
    const accessToken = await this.authenticate_web3_user(
      walletAddress,
      nonce,
      privateKey,
    );

    this.accessTokenCache.set(cacheKey, {
      token: accessToken,
      expiresAt: Date.now() + CampaignService.ACCESS_TOKEN_TTL_MS,
    });

    return accessToken;
  }

  async getJoinedCampaignKeys(accessToken: string): Promise<Set<string>> {
    const { data } = await this.hufiRecordingOracleAPI.get<{
      results: Array<Record<string, unknown>>;
    }>('/campaigns', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return new Set(
      (data.results ?? []).map(
        (c) =>
          `${c.chain_id ?? ''}:${String(
            c.escrow_address ?? c.address ?? '',
          ).toLowerCase()}`,
      ),
    );
  }

  async getJoinedCampaignBindings(accessToken: string): Promise<
    Array<{
      chainId: number;
      campaignAddress: string;
      exchangeName: string | null;
    }>
  > {
    const { data } = await this.hufiRecordingOracleAPI.get<{
      results: Array<Record<string, unknown>>;
    }>('/campaigns', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return (data.results ?? []).map((campaign) => ({
      chainId: Number(campaign.chain_id ?? 0),
      campaignAddress: String(
        campaign.escrow_address ?? campaign.address ?? '',
      ).toLowerCase(),
      exchangeName: campaign.exchange_name
        ? String(campaign.exchange_name).toLowerCase()
        : null,
    }));
  }

  /**
   * Function 3: Join Campaign
   * Enroll the authenticated user into a specific HuFi campaign.
   *
   * @param access_token - The token obtained from authenticate_web3_user
   * @param chain_id - The blockchain network ID of the campaign
   * @param campaign_address - The contract address of the campaign
   * @returns Success message or the full API response object
   * @throws Error if enrollment fails
   */
  async join_campaign(
    access_token: string,
    chain_id: number,
    campaign_address: string,
  ): Promise<any> {
    this.logger.log(
      `Joining campaign: ${campaign_address} on chain: ${chain_id}`,
    );

    try {
      const { data } = await this.hufiRecordingOracleAPI.post(
        '/campaigns/join',
        {
          chain_id: chain_id,
          address: campaign_address,
        },
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        },
      );

      this.logger.log(
        `Successfully joined campaign: ${campaign_address} on chain: ${chain_id}`,
      );

      return data;
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Unknown error occurred';

      // Provide more specific error messages based on status codes
      if (error.response?.status === 403) {
        this.logger.warn('Invalid or expired access token');
        throw new Error('Invalid or expired access token');
      } else if (error.response?.status === 400) {
        this.logger.warn(
          `Invalid campaign details or already joined: ${errorMessage}`,
        );
        throw new Error(
          `Invalid campaign details or already joined: ${errorMessage}`,
        );
      }

      this.logger.warn(`Error joining campaign: ${errorMessage}`, error.stack);
      throw new Error(`Failed to join campaign: ${errorMessage}`);
    }
  }

  async register_exchange_api_key(
    access_token: string,
    exchange_name: string,
    api_key: string,
    secret_key: string,
    extras?: Record<string, unknown>,
  ): Promise<any> {
    this.logger.log(`Registering exchange API key for ${exchange_name}`);

    try {
      const payload: Record<string, unknown> = {
        exchange_name,
        api_key,
        secret_key,
      };

      if (extras && Object.keys(extras).length > 0) {
        payload.extras = extras;
      }

      const { data } = await this.hufiRecordingOracleAPI.post(
        '/exchange-api-keys',
        payload,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        },
      );

      this.logger.log(
        `Successfully registered exchange API key for ${exchange_name}`,
      );

      return data;
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Unknown error occurred';

      this.logger.warn(
        `Error registering exchange API key for ${exchange_name}: ${errorMessage}`,
        error.stack,
      );
      throw new Error(`Failed to register exchange API key: ${errorMessage}`);
    }
  }

  /**
   * Helper method: Complete Campaign Join Flow
   * Orchestrates the complete flow to join a campaign by chaining the three functions:
   * 1. Get authentication nonce
   * 2. Authenticate with Web3 signature
   * 3. Join the campaign
   *
   * @param wallet_address - The user's Ethereum wallet address
   * @param private_key - The user's private key for signing
   * @param chain_id - The blockchain network ID of the campaign
   * @param campaign_address - The contract address of the campaign
   * @returns The API response from successfully joining the campaign
   * @throws Error if any step in the process fails
   */
  async joinCampaignWithAuth(
    wallet_address: string,
    private_key: string,
    exchange_name: string,
    api_key: string,
    secret_key: string,
    chain_id: number,
    campaign_address: string,
    extras?: Record<string, unknown>,
  ): Promise<any> {
    this.logger.log(
      `Starting complete campaign join flow for wallet: ${wallet_address}`,
    );

    try {
      const access_token = await this.getAccessToken(
        wallet_address,
        private_key,
      );

      await this.register_exchange_api_key(
        access_token,
        exchange_name,
        api_key,
        secret_key,
        extras,
      );

      const result = await this.join_campaign(
        access_token,
        chain_id,
        campaign_address,
      );

      this.logger.log(
        `Successfully completed campaign join flow for campaign: ${campaign_address}`,
      );

      return result;
    } catch (error) {
      this.logger.warn(
        `Failed to complete campaign join flow: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Every hour, check if there are any new campaigns to join
   */
  // Auto-join disabled intentionally.
  async joinCampaigns() {
    if (!this.campaignLauncherBaseUrl) {
      this.logger.warn(
        'Missing HuFi campaign launcher API base URL. Join campaign cron will not run.',
      );

      return;
    }
    if (!this.recordingOracleBaseUrl) {
      this.logger.warn(
        'Missing HuFi recording oracle API base URL. Join campaign cron will not run.',
      );

      return;
    }
    const campaigns = await this.getCampaigns();

    this.logger.log('Getting running campaigns');
    const runningCampaigns = campaigns.filter((campaign) => {
      return (
        campaign.status !== 'completed' &&
        new Date(campaign.end_date) >= new Date()
      );
    });

    if (runningCampaigns.length === 0) {
      this.logger.log('No campaigns to join');

      return;
    }

    this.logger.log(`Joining ${runningCampaigns.length} campaigns`);

    const firstCampaign = runningCampaigns[0];
    const walletAddress = await this.web3Service
      .getSigner(firstCampaign.chain_id)
      .getAddress();

    let joinedKeys: Set<string>;

    try {
      const privateKey = this.web3Service.getSigner(
        firstCampaign.chain_id,
      ).privateKey;
      const accessToken = await this.getAccessToken(walletAddress, privateKey);

      joinedKeys = await this.getJoinedCampaignKeys(accessToken);
    } catch (e) {
      this.logger.warn(
        'Failed to fetch joined campaigns, skipping join check: ',
        e.message,
      );
      joinedKeys = new Set();
    }

    for (const campaign of runningCampaigns) {
      try {
        const key = `${campaign.chain_id}:${campaign.address.toLowerCase()}`;

        if (joinedKeys.has(key)) {
          this.logger.log('Already joined campaign');
          continue;
        }

        const exchangeInstance = await this.exchangeService.getExchange(
          campaign.exchange_name,
          'read-only',
        );

        await this.hufiRecordingOracleAPI.post('/mr-market/campaign', {
          wallet_address: walletAddress,
          chain_id: campaign.chain_id,
          address: campaign.address,
          exchange_name: campaign.exchange_name,
          api_key: exchangeInstance.apiKey,
          secret: exchangeInstance.secret,
        });

        this.logger.log(
          `Joined Hu-Fi campaign:\n\tChainId: ${campaign.chain_id}\n\tAddress: ${campaign.address}\n\tExchange: ${campaign.exchange_name}`,
        );
      } catch (e) {
        this.logger.warn('Error joining campaign: ', e.message);
      }
    }
  }
}
