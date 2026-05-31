import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';
import { SetupStateEntity } from 'src/common/entities/admin/setup-state.entity';
import {
  GrowdataExchange,
  GrowdataMarketMakingPair,
  GrowdataSimplyGrowToken,
} from 'src/common/entities/data/grow-data.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { runSeed } from 'src/database/seeder/seed';
import { Repository } from 'typeorm';

import { AuthService } from '../auth/auth.service';
import { SetupConfigService } from '../setup-config/setup-config.service';
import { SetupStatusResponse } from './setup.types';

const SETUP_STATE_ID = 1;
const ALLOWED_ENV_KEYS = new Set([
  'MIXIN_APP_ID',
  'MIXIN_SESSION_ID',
  'MIXIN_SERVER_PUBLIC_KEY',
  'MIXIN_SESSION_PRIVATE_KEY',
  'MIXIN_SPEND_PRIVATE_KEY',
  'MIXIN_OAUTH_SECRET',
  'WEB3_MAINNET_RPC_URL',
  'WEB3_SEPOLIA_RPC_URL',
  'WEB3_POLYGON_RPC_URL',
  'WEB3_POLYGON_AMOY_RPC_URL',
  'WEB3_BSC_MAINNET_RPC_URL',
  'WEB3_BSC_TESTNET_RPC_URL',
  'WEB3_PRIVATE_KEY',
  'WEB3_GAS_MULTIPLIER',
  'COINGECKO_API_KEY',
  'DISCORD_WEBHOOK_URL',
  'REWARD_MIXIN_VAULT_USER_ID',
]);

@Injectable()
export class SetupService {
  constructor(
    @InjectRepository(SetupStateEntity)
    private readonly setupStateRepository: Repository<SetupStateEntity>,
    @InjectRepository(GrowdataExchange)
    private readonly exchangeRepository: Repository<GrowdataExchange>,
    @InjectRepository(GrowdataMarketMakingPair)
    private readonly marketMakingPairRepository: Repository<GrowdataMarketMakingPair>,
    @InjectRepository(GrowdataSimplyGrowToken)
    private readonly tokenRepository: Repository<GrowdataSimplyGrowToken>,
    @InjectRepository(CustomConfigEntity)
    private readonly customConfigRepository: Repository<CustomConfigEntity>,
    @InjectRepository(StrategyDefinition)
    private readonly strategyDefinitionRepository: Repository<StrategyDefinition>,
    private readonly authService: AuthService,
    private readonly setupConfigService: SetupConfigService,
  ) {}

  async getStatus(): Promise<SetupStatusResponse> {
    const state = await this.getState();

    return {
      initialized: state.initialized,
      seededAt: state.seededAt || null,
      completedAt: state.completedAt || null,
      completedSteps: state.completedSteps || {},
      seedRequired: await this.isSeedRequired(),
    };
  }

  async setPassword(password?: string) {
    const normalized = String(password || '').trim();

    const state = await this.getState();

    if (state.completedAt) {
      throw new ConflictException('Setup has already been completed');
    }
    if (state.initialized) {
      throw new ConflictException('Admin password has already been configured');
    }

    const accessToken = await this.authService.updateAdminPassword(normalized);
    const now = getRFC3339Timestamp();

    state.initialized = true;
    state.completedSteps = {
      ...(state.completedSteps || {}),
      password: true,
    };
    state.updatedAt = now;
    await this.setupStateRepository.save(state);

    return { access_token: accessToken, expires_in: 604800 };
  }

  async seedDatabase() {
    const state = await this.getState();

    this.assertInitialized(state);
    this.assertIncomplete(state);
    await runSeed();

    const now = getRFC3339Timestamp();

    state.seededAt = now;
    state.completedSteps = {
      ...(state.completedSteps || {}),
      seed: true,
    };
    state.updatedAt = now;
    await this.setupStateRepository.save(state);

    return { ok: true, seededAt: now };
  }

  async getSeedStatus() {
    return {
      seedRequired: await this.isSeedRequired(),
      checks: {
        exchanges: await this.exchangeRepository.count(),
        marketMakingPairs: await this.marketMakingPairRepository.count(),
        simplyGrowTokens: await this.tokenRepository.count(),
        customConfig: await this.customConfigRepository.count(),
        strategyDefinitions: await this.strategyDefinitionRepository.count(),
      },
    };
  }

  async completeStep(step: string) {
    const normalized = String(step || '').trim();

    if (!/^[a-z0-9_-]{1,64}$/.test(normalized)) {
      throw new BadRequestException('Invalid setup step');
    }

    const state = await this.getState();

    this.assertInitialized(state);
    this.assertIncomplete(state);
    state.completedSteps = {
      ...(state.completedSteps || {}),
      [normalized]: true,
    };
    state.updatedAt = getRFC3339Timestamp();
    await this.setupStateRepository.save(state);

    return { ok: true, completedSteps: state.completedSteps };
  }

  async completeSetup() {
    const state = await this.getState();

    this.assertInitialized(state);
    this.assertIncomplete(state);

    const required = ['password', 'exchange'];
    const missing = required.filter((step) => !state.completedSteps?.[step]);

    if (await this.isSeedRequired()) {
      missing.push('seed');
    }

    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing setup steps: ${missing.join(', ')}`,
      );
    }

    const now = getRFC3339Timestamp();

    state.completedAt = now;
    state.completedSteps = {
      ...(state.completedSteps || {}),
      complete: true,
    };
    state.updatedAt = now;
    await this.setupStateRepository.save(state);

    return { ok: true, completedAt: now };
  }

  async writeEnvValues(values?: Record<string, unknown>) {
    const state = await this.getState();

    this.assertInitialized(state);
    this.assertIncomplete(state);

    if (!values || typeof values !== 'object') {
      throw new BadRequestException('Environment values are required');
    }

    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(values)) {
      if (!ALLOWED_ENV_KEYS.has(key)) {
        throw new BadRequestException(`Unsupported environment key: ${key}`);
      }
      if (value === null || value === undefined || value === '') {
        continue;
      }
      sanitized[key] = String(value);
    }

    if (Object.keys(sanitized).length === 0) {
      throw new BadRequestException('No environment values provided');
    }

    const keys = await this.setupConfigService.setValues(sanitized);

    state.completedSteps = {
      ...(state.completedSteps || {}),
      env: true,
    };
    state.updatedAt = getRFC3339Timestamp();
    await this.setupStateRepository.save(state);

    return { ok: true, keys };
  }

  async listConfigStatus() {
    return this.setupConfigService.listConfigStatus();
  }

  private async getState(): Promise<SetupStateEntity> {
    let state = await this.setupStateRepository.findOne({
      where: { id: SETUP_STATE_ID },
    });

    if (!state) {
      state = this.setupStateRepository.create({
        id: SETUP_STATE_ID,
        initialized: false,
        completedSteps: {},
        seededAt: null,
        completedAt: null,
        updatedAt: getRFC3339Timestamp(),
      });
    }

    if (
      !state.initialized &&
      (await this.setupConfigService.hasAdminPassword())
    ) {
      state.initialized = true;
      state.completedSteps = {
        ...(state.completedSteps || {}),
        password: true,
      };
      state.updatedAt = getRFC3339Timestamp();
    }

    return this.setupStateRepository.save(state);
  }

  private async isSeedRequired(): Promise<boolean> {
    const [exchanges, pairs, tokens, customConfig, strategies] =
      await Promise.all([
        this.exchangeRepository.count(),
        this.marketMakingPairRepository.count(),
        this.tokenRepository.count(),
        this.customConfigRepository.count(),
        this.strategyDefinitionRepository.count(),
      ]);

    return (
      exchanges === 0 ||
      pairs === 0 ||
      tokens === 0 ||
      customConfig === 0 ||
      strategies === 0
    );
  }

  private assertInitialized(state: SetupStateEntity): void {
    if (!state.initialized) {
      throw new BadRequestException('Setup password must be configured first');
    }
  }

  private assertIncomplete(state: SetupStateEntity): void {
    if (state.completedAt) {
      throw new ConflictException('Setup has already been completed');
    }
  }
}
