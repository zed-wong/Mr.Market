import { BadRequestException, Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomConfigService } from 'src/modules/infrastructure/custom-config/custom-config.service';

type ConfigField =
  | 'spot_fee'
  | 'market_making_fee'
  | 'enable_spot_fee'
  | 'enable_market_making_fee'
  | 'funding_account';

type ConfigValue = string | boolean;
type ConfigType = 'decimal' | 'boolean' | 'string';

interface ConfigDefinition {
  key: string;
  field: ConfigField;
  label: string;
  category: string;
  description: string;
  type: ConfigType;
  mutable: boolean;
  defaultValue: ConfigValue;
  validation: Record<string, string | number | boolean>;
}

interface ResolvedConfigMutation {
  definition: ConfigDefinition;
  value: ConfigValue;
}

export interface AdminSystemConfigItem {
  key: string;
  label: string;
  category: string;
  description: string;
  value: ConfigValue | null;
  maskedValue: string | null;
  type: ConfigType;
  mutable: boolean;
  sensitive: boolean;
  validation: Record<string, string | number | boolean>;
  source: 'custom_config';
  sourceClass: 'database';
  sourceState: 'default' | 'override';
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AdminSystemConfigResponse {
  generatedAt: string;
  schemaVersion: string;
  items: AdminSystemConfigItem[];
  sections: Array<{
    key: string;
    label: string;
    items: AdminSystemConfigItem[];
  }>;
  summary: {
    total: number;
    mutable: number;
    overrides: number;
  };
  limits: {
    maxPayloadKeys: number;
    maxKeyLength: number;
    maxStringLength: number;
  };
}

const SCHEMA_VERSION = '2026-05';
const MAX_PAYLOAD_KEYS = 2;
const MAX_KEY_LENGTH = 100;
const MAX_STRING_LENGTH = 200;
const MAX_DECIMAL_PLACES = 8;
const DANGEROUS_PROPERTY_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);
const SENSITIVE_VALUE_PATTERN =
  /authorization|bearer\s+|password|passwd|pwd|secret|jwt|api[_-]?key|private[_-]?key|privatekey|session[_-]?token|access[_-]?token|refresh[_-]?token|-----BEGIN/i;

const DEFAULT_CUSTOM_CONFIG: Pick<CustomConfigEntity, ConfigField> = {
  spot_fee: '0.002',
  market_making_fee: '0.001',
  enable_spot_fee: true,
  enable_market_making_fee: true,
  funding_account: '',
};

const CONFIG_DEFINITIONS: ConfigDefinition[] = [
  {
    key: 'fees.spot_fee',
    field: 'spot_fee',
    label: 'Spot trading fee',
    category: 'fees',
    description: 'Global spot trading fee rate.',
    type: 'decimal',
    mutable: true,
    defaultValue: DEFAULT_CUSTOM_CONFIG.spot_fee,
    validation: {
      min: '0',
      max: '1',
      maxDecimalPlaces: MAX_DECIMAL_PLACES,
    },
  },
  {
    key: 'fees.market_making_fee',
    field: 'market_making_fee',
    label: 'Market making fee',
    category: 'fees',
    description: 'Global market-making fee rate.',
    type: 'decimal',
    mutable: true,
    defaultValue: DEFAULT_CUSTOM_CONFIG.market_making_fee,
    validation: {
      min: '0',
      max: '1',
      maxDecimalPlaces: MAX_DECIMAL_PLACES,
    },
  },
  {
    key: 'fees.enable_spot_fee',
    field: 'enable_spot_fee',
    label: 'Enable spot fee',
    category: 'fees',
    description: 'Whether global spot fees are enabled.',
    type: 'boolean',
    mutable: true,
    defaultValue: DEFAULT_CUSTOM_CONFIG.enable_spot_fee,
    validation: { allowedValues: 'true,false' },
  },
  {
    key: 'fees.enable_market_making_fee',
    field: 'enable_market_making_fee',
    label: 'Enable market making fee',
    category: 'fees',
    description: 'Whether global market-making fees are enabled.',
    type: 'boolean',
    mutable: true,
    defaultValue: DEFAULT_CUSTOM_CONFIG.enable_market_making_fee,
    validation: { allowedValues: 'true,false' },
  },
  {
    key: 'funding.funding_account',
    field: 'funding_account',
    label: 'Funding account',
    category: 'funding',
    description: 'Safe funding destination identifier or address.',
    type: 'string',
    mutable: true,
    defaultValue: DEFAULT_CUSTOM_CONFIG.funding_account,
    validation: {
      maxLength: MAX_STRING_LENGTH,
      rejectsSecretLikeValues: true,
    },
  },
];

const CONFIG_DEFINITION_BY_KEY = new Map(
  CONFIG_DEFINITIONS.map((definition) => [definition.key, definition]),
);

@Injectable()
export class AdminSystemConfigService {
  constructor(private readonly customConfigService: CustomConfigService) {}

  async getConfig(): Promise<AdminSystemConfigResponse> {
    const config = await this.getPrimaryConfig();
    const items = CONFIG_DEFINITIONS.map((definition) =>
      this.toItem(definition, config),
    );

    return this.buildResponse(items);
  }

  async updateConfig(payload: unknown) {
    const mutation = this.resolveUpdatePayload(payload);
    const config = await this.getOrCreatePrimaryConfig();

    config[mutation.definition.field] = mutation.value as never;
    const saved = await this.customConfigService.saveConfig(config);
    const item = this.toItem(mutation.definition, saved);

    return {
      generatedAt: getRFC3339Timestamp(),
      item,
    };
  }

  async resetConfig(payload: unknown) {
    const definition = this.resolveResetPayload(payload);
    const config = await this.getOrCreatePrimaryConfig();

    config[definition.field] = definition.defaultValue as never;
    const saved = await this.customConfigService.saveConfig(config);
    const item = this.toItem(definition, saved);

    return {
      generatedAt: getRFC3339Timestamp(),
      item,
    };
  }

  private async getPrimaryConfig(): Promise<CustomConfigEntity | null> {
    return await this.customConfigService.readPrimaryConfig();
  }

  private async getOrCreatePrimaryConfig(): Promise<CustomConfigEntity> {
    const config = await this.getPrimaryConfig();

    if (config) {
      return config;
    }

    return this.customConfigService.createConfig({
      config_id: 1,
      ...DEFAULT_CUSTOM_CONFIG,
    });
  }

  private buildResponse(
    items: AdminSystemConfigItem[],
  ): AdminSystemConfigResponse {
    const sections = [...new Set(items.map((item) => item.category))].map(
      (category) => ({
        key: category,
        label: this.labelForCategory(category),
        items: items.filter((item) => item.category === category),
      }),
    );

    return {
      generatedAt: getRFC3339Timestamp(),
      schemaVersion: SCHEMA_VERSION,
      items,
      sections,
      summary: {
        total: items.length,
        mutable: items.filter((item) => item.mutable).length,
        overrides: items.filter((item) => item.sourceState === 'override')
          .length,
      },
      limits: {
        maxPayloadKeys: MAX_PAYLOAD_KEYS,
        maxKeyLength: MAX_KEY_LENGTH,
        maxStringLength: MAX_STRING_LENGTH,
      },
    };
  }

  private toItem(
    definition: ConfigDefinition,
    config: CustomConfigEntity | null,
  ): AdminSystemConfigItem {
    const value = (config?.[definition.field] ??
      definition.defaultValue) as ConfigValue;

    return {
      key: definition.key,
      label: definition.label,
      category: definition.category,
      description: definition.description,
      value,
      maskedValue: null,
      type: definition.type,
      mutable: definition.mutable,
      sensitive: false,
      validation: definition.validation,
      source: 'custom_config',
      sourceClass: 'database',
      sourceState: this.sameConfigValue(value, definition.defaultValue)
        ? 'default'
        : 'override',
      updatedAt: null,
      updatedBy: null,
    };
  }

  private resolveUpdatePayload(payload: unknown): ResolvedConfigMutation {
    const body = this.validateBodyShape(payload, ['key', 'value']);
    const definition = this.resolveMutableDefinition(body.key);
    const value = this.normalizeValue(definition, body.value);

    return { definition, value };
  }

  private resolveResetPayload(payload: unknown): ConfigDefinition {
    const body = this.validateBodyShape(payload, ['key']);

    return this.resolveMutableDefinition(body.key);
  }

  private validateBodyShape(
    payload: unknown,
    allowedKeys: string[],
  ): Record<string, unknown> {
    if (!this.isPlainRecord(payload)) {
      throw new BadRequestException('Config payload must be a plain object.');
    }

    const keys = Reflect.ownKeys(payload);

    if (keys.length > MAX_PAYLOAD_KEYS) {
      throw new BadRequestException('Config payload has too many properties.');
    }

    for (const key of keys) {
      if (typeof key !== 'string') {
        throw new BadRequestException(
          'Config payload contains unsupported properties.',
        );
      }

      this.assertSafePropertyName(key);

      if (!allowedKeys.includes(key)) {
        throw new BadRequestException(
          'Config payload contains unexpected properties.',
        );
      }
    }

    for (const requiredKey of allowedKeys) {
      if (!Object.prototype.hasOwnProperty.call(payload, requiredKey)) {
        throw new BadRequestException(
          `Config payload is missing ${requiredKey}.`,
        );
      }
    }

    return payload;
  }

  private resolveMutableDefinition(value: unknown): ConfigDefinition {
    if (typeof value !== 'string') {
      throw new BadRequestException('Config key must be a string.');
    }

    const key = value.trim();

    if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
      throw new BadRequestException('Config key is invalid.');
    }

    for (const segment of key.split('.')) {
      this.assertSafePropertyName(segment);
    }

    const definition = CONFIG_DEFINITION_BY_KEY.get(key);

    if (!definition || !definition.mutable) {
      throw new BadRequestException('Unknown or immutable config key.');
    }

    return definition;
  }

  private normalizeValue(
    definition: ConfigDefinition,
    value: unknown,
  ): ConfigValue {
    switch (definition.type) {
      case 'decimal':
        return this.normalizeDecimal(value, definition);
      case 'boolean':
        return this.normalizeBoolean(value);
      case 'string':
        return this.normalizeString(value);
      default:
        throw new BadRequestException('Unsupported config type.');
    }
  }

  private normalizeDecimal(
    value: unknown,
    definition: ConfigDefinition,
  ): string {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new BadRequestException('Config value must be a decimal string.');
    }

    if (typeof value === 'string' && value.trim() !== value) {
      throw new BadRequestException(
        'Config decimal value must not contain padding.',
      );
    }

    const decimal = new BigNumber(value);
    const min = new BigNumber(String(definition.validation.min));
    const max = new BigNumber(String(definition.validation.max));

    if (
      !decimal.isFinite() ||
      decimal.isNaN() ||
      decimal.isLessThan(min) ||
      decimal.isGreaterThan(max) ||
      (decimal.decimalPlaces() || 0) > MAX_DECIMAL_PLACES
    ) {
      throw new BadRequestException(
        'Config decimal value is outside allowed range.',
      );
    }

    return decimal.toFixed();
  }

  private normalizeBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    throw new BadRequestException('Config value must be boolean.');
  }

  private normalizeString(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('Config value must be a string.');
    }

    const trimmed = value.trim();

    if (
      trimmed.length > MAX_STRING_LENGTH ||
      /[\u0000-\u001f]/.test(trimmed) ||
      SENSITIVE_VALUE_PATTERN.test(trimmed)
    ) {
      throw new BadRequestException('Config string value is invalid.');
    }

    return trimmed;
  }

  private assertSafePropertyName(name: string) {
    if (
      DANGEROUS_PROPERTY_NAMES.has(name) ||
      DANGEROUS_PROPERTY_NAMES.has(name.toLowerCase())
    ) {
      throw new BadRequestException(
        'Config payload contains an unsafe property.',
      );
    }
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
  }

  private sameConfigValue(left: ConfigValue, right: ConfigValue): boolean {
    return String(left) === String(right);
  }

  private labelForCategory(category: string): string {
    const labels: Record<string, string> = {
      fees: 'Fees',
      funding: 'Funding',
    };

    return labels[category] || category;
  }
}
