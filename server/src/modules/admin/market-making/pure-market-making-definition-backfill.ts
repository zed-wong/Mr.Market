import {
  type StrategyDefinition,
  type StrategyDefinitionCapabilities,
  StrategyDefinitionVisibility,
} from 'src/common/entities/market-making/strategy-definition.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import pureMarketMakingSeedDefinition from 'src/database/seeder/data/strategies/pure-market-making.json';

type SeededStrategyDefinitionConfig = {
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  capabilities?: StrategyDefinitionCapabilities;
};

const PURE_MARKET_MAKING_SEED =
  pureMarketMakingSeedDefinition as SeededStrategyDefinitionConfig;

export const PURE_MARKET_MAKING_DEFINITION_KEY = 'pure_market_making';

export const PURE_MARKET_MAKING_DEFINITION_ALIASES = [
  PURE_MARKET_MAKING_DEFINITION_KEY,
  'pure-market-making',
  'market_making',
  'market-making',
] as const;

export const PURE_MARKET_MAKING_CAPABILITIES: StrategyDefinitionCapabilities = {
  launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
  directExecutionMode: 'single_account',
};

export function buildPureMarketMakingDefinitionBackfill(
  existing?: Partial<StrategyDefinition>,
): Partial<StrategyDefinition> {
  const now = getRFC3339Timestamp();

  return {
    id: existing?.id,
    key:
      existing?.key &&
      PURE_MARKET_MAKING_DEFINITION_ALIASES.includes(
        existing.key as (typeof PURE_MARKET_MAKING_DEFINITION_ALIASES)[number],
      )
        ? existing.key
        : PURE_MARKET_MAKING_DEFINITION_KEY,
    name: 'Pure Market Making',
    description: 'Place buy and sell orders on both sides of the order book',
    controllerType: 'pureMarketMaking',
    configSchema: PURE_MARKET_MAKING_SEED.configSchema,
    defaultConfig: PURE_MARKET_MAKING_SEED.defaultConfig,
    capabilities:
      PURE_MARKET_MAKING_SEED.capabilities || PURE_MARKET_MAKING_CAPABILITIES,
    enabled: true,
    visibility: StrategyDefinitionVisibility.PUBLIC,
    createdBy: existing?.createdBy || 'strategy-definition-backfill',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}
