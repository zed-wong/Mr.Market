import {
  type StrategyDefinition,
  type StrategyDefinitionCapabilities,
  StrategyDefinitionVisibility,
} from 'src/common/entities/market-making/strategy-definition.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';

export const EFFICIENT_DUAL_ACCOUNT_VOLUME_DEFINITION_KEY =
  'efficient_dual_account_volume';

export const EFFICIENT_DUAL_ACCOUNT_VOLUME_DEFINITION_ALIASES = [
  EFFICIENT_DUAL_ACCOUNT_VOLUME_DEFINITION_KEY,
  'efficient-dual-account-volume',
] as const;

export const EFFICIENT_DUAL_ACCOUNT_VOLUME_CAPABILITIES: StrategyDefinitionCapabilities =
  {
    launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
    directExecutionMode: 'dual_account',
  };

const EFFICIENT_DUAL_ACCOUNT_VOLUME_CONFIG_SCHEMA = {
  type: 'object',
  required: ['symbol', 'maxOrderAmount'],
  properties: {
    symbol: {
      type: 'string',
      description: 'Trading pair symbol (e.g. BTC/USDT)',
    },
    maxOrderAmount: {
      type: 'number',
      description:
        'Maximum base amount to trade per cycle; live balance/capacity can reduce the executed amount',
      minimum: 0,
    },
    mode: {
      type: 'string',
      enum: ['cheapest_capital', 'balanced', 'fastest_volume'],
      description: 'Capital/volume tradeoff mode. Defaults to balanced.',
    },
    interval: {
      type: 'number',
      description: 'Optional seconds between execution cycles',
      minimum: 1,
    },
    dailyVolumeTarget: {
      type: 'number',
      description: 'Optional quote-volume cap for the session',
      minimum: 0,
    },
    tradeAmountVariance: {
      type: 'number',
      description: 'Fractional variance applied to selected cycle quantity',
      minimum: 0,
    },
    priceOffsetVariance: {
      type: 'number',
      description: 'Fractional variance applied to maker price offset',
      minimum: 0,
    },
    cycleMode: {
      type: 'string',
      enum: ['alternating', 'static'],
      description: 'Cycle role mode. Unified direct orders default to alternating.',
    },
    dynamicRoleSwitching: {
      type: 'boolean',
      description:
        'Switch maker/taker roles dynamically based on balances. Unified direct orders default to true.',
    },
    strategyContract: {
      type: 'string',
      enum: ['efficientDualAccountVolume'],
      description:
        'Unified Efficient Dual Account Volume backend contract marker',
    },
    safetyBuffer: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['default_formula'],
        },
        exchangeCostMinMultiplier: {
          type: 'number',
          minimum: 0,
        },
        feeCostMultiplier: {
          type: 'number',
          minimum: 0,
        },
      },
      additionalProperties: false,
    },
    makerAccountLabel: {
      type: 'string',
      description: 'Maker account label injected by admin direct start',
    },
    takerAccountLabel: {
      type: 'string',
      description: 'Taker account label injected by admin direct start',
    },
    pair: {
      type: 'string',
      description: 'Pair alias injected by admin direct start',
    },
    exchangeName: {
      type: 'string',
      description: 'Exchange injected by admin direct start',
    },
    userId: {
      type: 'string',
      description: 'Runtime user id injected by admin direct start',
    },
    clientId: {
      type: 'string',
      description: 'Runtime client/order id injected by admin direct start',
    },
    marketMakingOrderId: {
      type: 'string',
      description: 'Runtime market-making order id injected by admin direct start',
    },
  },
  additionalProperties: false,
};

const EFFICIENT_DUAL_ACCOUNT_VOLUME_DEFAULT_CONFIG = {
  symbol: 'BTC/USDT',
  maxOrderAmount: 0.1,
  interval: 30,
  mode: 'balanced',
  cycleMode: 'alternating',
  dynamicRoleSwitching: true,
  strategyContract: 'efficientDualAccountVolume',
  safetyBuffer: {
    kind: 'default_formula',
    exchangeCostMinMultiplier: 0.5,
    feeCostMultiplier: 2,
  },
};

export function buildEfficientDualAccountVolumeDefinitionBackfill(
  existing?: Partial<StrategyDefinition>,
): Partial<StrategyDefinition> {
  const now = getRFC3339Timestamp();

  return {
    id: existing?.id,
    key:
      existing?.key &&
      EFFICIENT_DUAL_ACCOUNT_VOLUME_DEFINITION_ALIASES.includes(
        existing.key as (typeof EFFICIENT_DUAL_ACCOUNT_VOLUME_DEFINITION_ALIASES)[number],
      )
        ? existing.key
        : EFFICIENT_DUAL_ACCOUNT_VOLUME_DEFINITION_KEY,
    name: 'Efficient Dual Account Volume',
    description:
      'Generate capital-efficient paired maker/taker volume using one unified dual-account contract',
    controllerType: 'efficientDualAccountVolume',
    configSchema: EFFICIENT_DUAL_ACCOUNT_VOLUME_CONFIG_SCHEMA,
    defaultConfig: EFFICIENT_DUAL_ACCOUNT_VOLUME_DEFAULT_CONFIG,
    capabilities: EFFICIENT_DUAL_ACCOUNT_VOLUME_CAPABILITIES,
    enabled: true,
    visibility: StrategyDefinitionVisibility.ADMIN,
    createdBy: existing?.createdBy || 'strategy-definition-backfill',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}
