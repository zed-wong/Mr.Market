import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import type { MarketMakingOrderStrategySnapshot } from 'src/common/entities/orders/user-orders.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Repository } from 'typeorm';

import type { StrategyType } from '../config/strategy-controller.types';
import { normalizeControllerType } from '../config/strategy-controller-aliases';
import { normalizeExecutionCategory } from '../config/strategy-execution-category';
import { normalizeEfficientDualAccountVolumeConfig } from '../dual-account/dual-account-config';
import { StrategyRuntimeDispatcherService } from '../execution/strategy-runtime-dispatcher.service';

type StrategyConfig = Record<string, unknown>;
type StrategyConfigSchema = {
  type?: string;
  required?: string[];
  properties?: Record<string, StrategyConfigSchema>;
  additionalProperties?: boolean;
  minimum?: number;
  enum?: unknown[];
};

const DECIMAL_STRING_CONFIG_FIELDS = new Set([
  'amount',
  'amountToTrade',
  'baseTradeAmount',
  'bidSpread',
  'askSpread',
  'ceilingPrice',
  'floorPrice',
  'maxOrderAmount',
  'orderAmount',
  'price',
  'qty',
  'targetQuoteVolume',
  'tradeAmount',
]);

@Injectable()
export class StrategyConfigResolverService {
  private readonly logger = new Logger(StrategyConfigResolverService.name);

  constructor(
    @InjectRepository(StrategyDefinition)
    private readonly strategyDefinitionRepository: Repository<StrategyDefinition>,
    private readonly strategyRuntimeDispatcher: StrategyRuntimeDispatcherService,
  ) {}

  getDefinitionControllerType(definition: Partial<StrategyDefinition>): string {
    const controllerType = normalizeControllerType(definition.controllerType);

    if (!controllerType) {
      throw new BadRequestException(
        'Strategy definition controllerType is missing',
      );
    }

    return controllerType;
  }

  resolveDefinitionStartConfig(
    definition: StrategyDefinition,
    payload: {
      userId: string;
      clientId: string;
      marketMakingOrderId?: string;
      config?: Record<string, unknown>;
    },
    options?: {
      skipEnabledCheck?: boolean;
    },
  ): {
    mergedConfig: StrategyConfig;
    strategyType: StrategyType;
  } {
    if (!options?.skipEnabledCheck) {
      this.ensureDefinitionEnabled(definition);
    }
    const strategyType = this.toStrategyType(definition);
    const marketMakingOrderId =
      strategyType === 'pureMarketMaking'
        ? payload.marketMakingOrderId || payload.clientId
        : undefined;

    const mergedConfig = this.normalizeAndValidateConfig(definition, {
      ...this.toConfig(definition.defaultConfig),
      ...(payload.config || {}),
      userId: payload.userId,
      clientId: marketMakingOrderId || payload.clientId,
      ...(marketMakingOrderId ? { marketMakingOrderId } : {}),
    });

    return {
      mergedConfig,
      strategyType,
    };
  }

  async resolveForOrderSnapshot(
    strategyDefinitionId: string,
    overrides?: Record<string, unknown>,
  ): Promise<MarketMakingOrderStrategySnapshot> {
    const definition = await this.strategyDefinitionRepository.findOne({
      where: { id: strategyDefinitionId },
    });

    if (!definition) {
      throw new BadRequestException(
        `Strategy definition ${strategyDefinitionId} not found`,
      );
    }

    const controllerType = this.getDefinitionControllerType(definition);
    const resolvedConfig = this.normalizeAndValidateConfig(definition, {
      ...this.toConfig(definition.defaultConfig),
      ...(overrides || {}),
    });

    return {
      strategyDefinitionId: definition.id,
      definitionKey: definition.key,
      definitionName: definition.name,
      controllerType,
      resolvedConfig,
      resolvedAt: getRFC3339Timestamp(),
    };
  }

  private ensureDefinitionEnabled(definition: StrategyDefinition): void {
    if (!definition.enabled) {
      throw new BadRequestException(
        `Strategy definition ${definition.key} is disabled`,
      );
    }
  }

  private toStrategyType(
    definition: Partial<StrategyDefinition>,
  ): StrategyType {
    return this.strategyRuntimeDispatcher.toStrategyType(
      this.getDefinitionControllerType(definition),
    );
  }

  private normalizeAndValidateConfig(
    definition: Partial<StrategyDefinition>,
    config: StrategyConfig,
  ): StrategyConfig {
    const strategyType = this.toStrategyType(definition);
    const normalizedConfig: StrategyConfig = { ...config };

    if (strategyType === 'volume') {
      normalizedConfig.executionCategory = normalizeExecutionCategory(
        this.readString(normalizedConfig.executionCategory) ||
          this.readString(normalizedConfig.executionVenue),
      );
      if (normalizedConfig.executionCategory === 'clob_dex') {
        throw new BadRequestException(
          'executionCategory clob_dex is not implemented yet. Use clob or amm',
        );
      }
      normalizedConfig.executionVenue =
        normalizedConfig.executionCategory === 'amm' ? 'dex' : 'cex';
    }

    if (strategyType === 'efficientDualAccountVolume') {
      Object.assign(
        normalizedConfig,
        this.mapConfigError(() =>
          normalizeEfficientDualAccountVolumeConfig(normalizedConfig, {
            requireAccounts: false,
            requireMarket: false,
          }),
        ),
      );
    }

    this.validateConfigAgainstSchema(
      normalizedConfig,
      this.toConfigSchema(definition.configSchema),
    );

    return this.normalizeDecimalStringFields(normalizedConfig);
  }

  private mapConfigError<T>(fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  validateConfigAgainstSchema(
    config: StrategyConfig,
    schema: StrategyConfigSchema,
    path = '',
  ): void {
    const schemaType = schema?.type;

    if (schemaType && schemaType !== 'object') {
      throw new BadRequestException('Only object config schemas are supported');
    }

    const required = Array.isArray(schema?.required) ? schema.required : [];
    const properties =
      schema?.properties && typeof schema.properties === 'object'
        ? schema.properties
        : {};
    const additionalProperties = schema?.additionalProperties;

    for (const field of required) {
      if (config[field] === undefined || config[field] === null) {
        throw new BadRequestException(
          `Missing required config field: ${field}`,
        );
      }
    }

    for (const [field, rule] of Object.entries(properties)) {
      const fieldPath = path ? `${path}.${field}` : field;

      if (config[field] === undefined || config[field] === null) {
        continue;
      }
      const value = config[field];

      if (rule.type === 'string' && typeof value !== 'string') {
        throw new BadRequestException(
          `Config field ${fieldPath} must be string`,
        );
      }
      if (
        rule.type === 'number' &&
        typeof value !== 'number' &&
        !this.isNumericString(value)
      ) {
        throw new BadRequestException(
          `Config field ${fieldPath} must be number`,
        );
      }
      if (rule.type === 'boolean' && typeof value !== 'boolean') {
        throw new BadRequestException(
          `Config field ${fieldPath} must be boolean`,
        );
      }
      if (rule.type === 'array' && !Array.isArray(value)) {
        throw new BadRequestException(
          `Config field ${fieldPath} must be array`,
        );
      }
      if (rule.type === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) {
          throw new BadRequestException(
            `Config field ${fieldPath} must be object`,
          );
        }
        this.validateConfigAgainstSchema(
          value as Record<string, unknown>,
          rule,
          fieldPath,
        );
      }
      if (rule.minimum !== undefined) {
        const numericValue =
          typeof value === 'number'
            ? value
            : this.isNumericString(value)
            ? Number(value)
            : undefined;

        if (numericValue !== undefined && numericValue < Number(rule.minimum)) {
          throw new BadRequestException(
            `Config field ${fieldPath} must be >= ${rule.minimum}`,
          );
        }
      }
      if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
        throw new BadRequestException(
          `Config field ${fieldPath} must be one of: ${rule.enum.join(', ')}`,
        );
      }
    }

    if (additionalProperties === false) {
      const knownFields = new Set(Object.keys(properties));

      for (const field of Object.keys(config)) {
        if (!knownFields.has(field)) {
          const fieldPath = path ? `${path}.${field}` : field;

          this.logger.error(
            `Strategy config additionalProperties violation ${JSON.stringify({
              fieldPath,
              configKeys: Object.keys(config),
              allowedKeys: [...knownFields],
            })}`,
          );

          throw new BadRequestException(
            `Config field ${fieldPath} is not allowed`,
          );
        }
      }
    }
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private isNumericString(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      value.trim().length > 0 &&
      Number.isFinite(Number(value))
    );
  }

  private normalizeDecimalStringFields(config: StrategyConfig): StrategyConfig {
    return Object.fromEntries(
      Object.entries(config).map(([key, value]) => {
        if (
          DECIMAL_STRING_CONFIG_FIELDS.has(key) &&
          (typeof value === 'number' || this.isNumericString(value))
        ) {
          return [key, String(value)];
        }

        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return [
            key,
            this.normalizeDecimalStringFields(value as Record<string, unknown>),
          ];
        }

        return [key, value];
      }),
    );
  }

  private toConfig(value: unknown): StrategyConfig {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as StrategyConfig;
  }

  private toConfigSchema(value: unknown): StrategyConfigSchema {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as StrategyConfigSchema;
  }
}
