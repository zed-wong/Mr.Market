import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { Repository } from 'typeorm';

import type { StrategyType } from '../config/strategy-controller.types';
import { normalizeControllerType } from '../config/strategy-controller-aliases';
import { normalizeExecutionCategory } from '../config/strategy-execution-category';
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

@Injectable()
export class StrategyConfigResolverService {
  constructor(
    @InjectRepository(StrategyDefinition)
    private readonly strategyDefinitionRepository: Repository<StrategyDefinition>,
    private readonly strategyRuntimeDispatcher: StrategyRuntimeDispatcherService,
  ) {}

  getDefinitionControllerType(definition: Partial<StrategyDefinition>): string {
    const controllerType = normalizeControllerType(
      definition.controllerType || definition.executorType,
    );

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
    definitionId: string,
    overrides?: Record<string, unknown>,
  ): Promise<{
    controllerType: string;
    resolvedConfig: Record<string, unknown>;
  }> {
    const definition = await this.strategyDefinitionRepository.findOne({
      where: { id: definitionId },
    });

    if (!definition) {
      throw new BadRequestException(
        `Strategy definition ${definitionId} not found`,
      );
    }

    const controllerType = this.getDefinitionControllerType(definition);
    const resolvedConfig = this.normalizeAndValidateConfig(definition, {
      ...this.toConfig(definition.defaultConfig),
      ...(overrides || {}),
    });

    return {
      controllerType,
      resolvedConfig,
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
          'executionCategory clob_dex is not implemented yet. Use clob_cex or amm_dex',
        );
      }
      normalizedConfig.executionVenue =
        normalizedConfig.executionCategory === 'amm_dex' ? 'dex' : 'cex';
    }

    this.validateConfigAgainstSchema(
      normalizedConfig,
      this.toConfigSchema(definition.configSchema),
    );

    return normalizedConfig;
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
      if (rule.type === 'number' && typeof value !== 'number') {
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
      if (rule.minimum !== undefined && typeof value === 'number') {
        if (value < Number(rule.minimum)) {
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
