import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { SetupConfigEntity } from 'src/common/entities/admin/setup-config.entity';
import {
  decrypt,
  encrypt,
  getPublicKeyFromPrivate,
} from 'src/common/helpers/crypto';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Repository } from 'typeorm';

const ADMIN_PASSWORD_HASH_KEY = 'ADMIN_PASSWORD_HASH';

const CONFIG_PATH_BY_ENV_KEY: Record<string, string> = {
  MIXIN_APP_ID: 'mixin.app_id',
  MIXIN_SESSION_ID: 'mixin.session_id',
  MIXIN_SERVER_PUBLIC_KEY: 'mixin.server_public_key',
  MIXIN_SESSION_PRIVATE_KEY: 'mixin.session_private_key',
  MIXIN_SPEND_PRIVATE_KEY: 'mixin.spend_private_key',
  MIXIN_OAUTH_SECRET: 'mixin.oauth_secret',
  WEB3_MAINNET_RPC_URL: 'web3.network.mainnet.rpc_url',
  WEB3_SEPOLIA_RPC_URL: 'web3.network.sepolia.rpc_url',
  WEB3_POLYGON_RPC_URL: 'web3.network.polygon.rpc_url',
  WEB3_POLYGON_AMOY_RPC_URL: 'web3.network.polygon_amoy.rpc_url',
  WEB3_BSC_MAINNET_RPC_URL: 'web3.network.bsc.rpc_url',
  WEB3_BSC_TESTNET_RPC_URL: 'web3.network.bsc_testnet.rpc_url',
  WEB3_PRIVATE_KEY: 'web3.private_key',
  WEB3_GAS_MULTIPLIER: 'web3.gas_multiplier',
  COINGECKO_API_KEY: 'coingecko.api_key',
  REWARD_MIXIN_VAULT_USER_ID: 'reward.mixin_vault_user_id',
};

@Injectable()
export class SetupConfigService implements OnModuleInit {
  constructor(
    @InjectRepository(SetupConfigEntity)
    private readonly setupConfigRepository: Repository<SetupConfigEntity>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const entries = await this.setupConfigRepository.find();

    for (const entry of entries) {
      if (entry.key === ADMIN_PASSWORD_HASH_KEY) {
        continue;
      }

      const value = await this.getValue(entry.key);

      if (value) {
        this.applyRuntimeValue(entry.key, value);
      }
    }
  }

  async setValues(values: Record<string, string>) {
    const saved: string[] = [];

    for (const [key, value] of Object.entries(values)) {
      await this.saveEntry(key, value, this.isSecretKey(key));
      this.applyRuntimeValue(key, value);
      saved.push(key);
    }

    return saved;
  }

  async setAdminPassword(password: string): Promise<string> {
    const hash = this.hash(password);

    await this.saveEntry(ADMIN_PASSWORD_HASH_KEY, hash, true, false);
    this.configService.set('admin.pass', password);

    return hash;
  }

  async getAdminPasswordHash(): Promise<string | null> {
    const stored = await this.getValue(ADMIN_PASSWORD_HASH_KEY);

    if (stored) {
      return stored;
    }

    const envPassword = this.configService.get<string>('admin.pass');

    return envPassword ? this.hash(envPassword) : null;
  }

  async hasAdminPassword(): Promise<boolean> {
    return Boolean(await this.getAdminPasswordHash());
  }

  async getValue(key: string): Promise<string | null> {
    const entry = await this.setupConfigRepository.findOne({ where: { key } });

    if (!entry) {
      const configPath = CONFIG_PATH_BY_ENV_KEY[key];

      return configPath
        ? String(this.configService.get(configPath) || '') || null
        : null;
    }

    if (!entry.encrypted) {
      return entry.value;
    }

    const privateKey = this.getEncryptionPrivateKey();

    return privateKey ? decrypt(entry.value, privateKey) : null;
  }

  async listConfigStatus() {
    const entries = await this.setupConfigRepository.find({
      order: { key: 'ASC' },
    });

    return entries.map((entry) => ({
      key: entry.key,
      configured: Boolean(entry.value),
      secret: entry.secret,
      encrypted: entry.encrypted,
      updatedAt: entry.updatedAt || null,
    }));
  }

  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async saveEntry(
    key: string,
    value: string,
    secret: boolean,
    encryptSecret = true,
  ): Promise<void> {
    const privateKey = this.getEncryptionPrivateKey();
    const encrypted = Boolean(secret && encryptSecret && privateKey);
    const storedValue = encrypted
      ? encrypt(value, getPublicKeyFromPrivate(privateKey))
      : value;

    await this.setupConfigRepository.save({
      key,
      value: storedValue,
      encrypted,
      secret,
      updatedAt: getRFC3339Timestamp(),
    });
  }

  private applyRuntimeValue(key: string, value: string): void {
    const configPath = CONFIG_PATH_BY_ENV_KEY[key];

    if (!configPath) {
      return;
    }

    this.configService.set(
      configPath,
      key === 'WEB3_GAS_MULTIPLIER' ? Number(value) || 1 : value,
    );
  }

  private isSecretKey(key: string): boolean {
    return (
      key.includes('SECRET') ||
      key.includes('PRIVATE_KEY') ||
      key.includes('API_KEY') ||
      key.includes('WEBHOOK')
    );
  }

  private getEncryptionPrivateKey(): string {
    return (
      this.configService.get<string>('admin.encryption_private_key') ||
      ''
    );
  }
}
