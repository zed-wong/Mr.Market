import { BadRequestException, Injectable } from '@nestjs/common';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';

import { StrategyType } from '../config/strategy-controller.types';
import { normalizeExecutionCategory } from '../config/strategy-execution-category';
import { StrategyRuntimeDispatcherService } from '../execution/strategy-runtime-dispatcher.service';

@Injectable()
export class StrategyConfigResolverService {
  constructor(
    private readonly strategyRuntimeDispatcher: StrategyRuntimeDispatcherService,
  ) {}

  getDefinitionControllerType(definition: Partial<StrategyDefinition>): string {
    const controllerType = definition.controllerType || definition.executorType;

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
  ): {
    mergedConfig: Record<string, any>;
    strategyType: StrategyType;
  } {
    if (!definition.enabled) {
      throw new BadRequestException(
        `Strategy definition ${definition.key} is disabled`,
      );
    }

    const strategyType = this.strategyRuntimeDispatcher.toStrategyType(
      this.getDefinitionControllerType(definition),
    );
    const marketMakingOrderId =
      strategyType === 'pureMarketMaking'
        ? payload.marketMakingOrderId || payload.clientId
        : undefined;

    const mergedConfig = {
      ...(definition.defaultConfig || {}),
      ...(payload.config || {}),
      userId: payload.userId,
      clientId: marketMakingOrderId || payload.clientId,
      ...(marketMakingOrderId ? { marketMakingOrderId } : {}),
    } as Record<string, any>;

    if (strategyType === 'volume') {
      mergedConfig.executionCategory = normalizeExecutionCategory(
        mergedConfig.executionCategory || mergedConfig.executionVenue,
      );
      mergedConfig.executionVenue =
        mergedConfig.executionCategory === 'amm_dex' ? 'dex' : 'cex';
    }

    this.validateConfigAgainstSchema(
      mergedConfig,
      definition.configSchema || {},
    );

    return {
      mergedConfig,
      strategyType,
    };
  }

  validateConfigAgainstSchema(
    config: Record<string, any>,
    schema: Record<string, any>,
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

    for (const [field, rule] of Object.entries<Record<string, any>>(
      properties,
    )) {
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
        this.validateConfigAgainstSchema(value, rule, fieldPath);
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
}
