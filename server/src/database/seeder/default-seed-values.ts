import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';
import {
  GrowdataExchange,
  GrowdataMarketMakingPair,
  GrowdataSimplyGrowToken,
} from 'src/common/entities/data/grow-data.entity';
import { SpotdataTradingPair } from 'src/common/entities/data/spot-data.entity';
import {
  StrategyDefinition,
  type StrategyDefinitionCapabilities,
  StrategyDefinitionVisibility,
  type StrategyDirectExecutionMode,
} from 'src/common/entities/market-making/strategy-definition.entity';

import { TOP_EXCHANGES as EXCHANGES } from './data/exchanges';
import arbitrageSeedDefinition from './data/strategies/arbitrage.json';
import dualAccountBestCapacityVolumeSeedDefinition from './data/strategies/dual-account-best-capacity-volume.json';
import dualAccountVolumeSeedDefinition from './data/strategies/dual-account-volume.json';
import pureMarketMakingSeedDefinition from './data/strategies/pure-market-making.json';
import timeIndicatorSeedDefinition from './data/strategies/time-indicator.json';
import volumeSeedDefinition from './data/strategies/volume.json';

type SeededStrategyDefinitionConfig = {
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
};

function splitSeedConfig(
  seed: SeededStrategyDefinitionConfig,
): SeededStrategyDefinitionConfig & {
  capabilities?: StrategyDefinitionCapabilities;
} {
  const { launchSurfaces, directExecutionMode, ...configSchema } =
    seed.configSchema;
  const resolvedDirectExecutionMode: StrategyDirectExecutionMode | null =
    directExecutionMode === 'single_account' ||
    directExecutionMode === 'dual_account'
      ? directExecutionMode
      : null;
  const capabilities =
    Array.isArray(launchSurfaces) || directExecutionMode
      ? {
          launchSurfaces: Array.isArray(launchSurfaces)
            ? launchSurfaces.filter(
                (surface): surface is string => typeof surface === 'string',
              )
            : [],
          directExecutionMode: resolvedDirectExecutionMode,
        }
      : undefined;

  return {
    configSchema,
    defaultConfig: seed.defaultConfig,
    capabilities,
  };
}

const pureMarketMakingSeed = splitSeedConfig(
  pureMarketMakingSeedDefinition as SeededStrategyDefinitionConfig,
);
const arbitrageSeed = splitSeedConfig(
  arbitrageSeedDefinition as SeededStrategyDefinitionConfig,
);
const volumeSeed = splitSeedConfig(
  volumeSeedDefinition as SeededStrategyDefinitionConfig,
);
const dualAccountVolumeSeed = splitSeedConfig(
  dualAccountVolumeSeedDefinition as SeededStrategyDefinitionConfig,
);
const dualAccountBestCapacityVolumeSeed = splitSeedConfig(
  dualAccountBestCapacityVolumeSeedDefinition as SeededStrategyDefinitionConfig,
);
const timeIndicatorSeed = splitSeedConfig(
  timeIndicatorSeedDefinition as SeededStrategyDefinitionConfig,
);

// Export exchanges from data file
export const defaultExchanges: GrowdataExchange[] = EXCHANGES.map((e) => ({
  exchange_id: e.exchange_id,
  name: e.name,
  icon_url: e.icon_url,
  enable: e.enable,
}));

// SimplyGrow tokens - now dynamically fetched from Mixin API in seed.ts
export const defaultSimplyGrowTokens: GrowdataSimplyGrowToken[] = [];

// Custom config - singleton with config_id = 1
export const defaultCustomConfig: CustomConfigEntity = {
  config_id: 1,
  spot_fee: '0.002',
  market_making_fee: '0.001',
  enable_spot_fee: true,
  enable_market_making_fee: true,
  max_balance_mixin_bot: '0',
  max_balance_single_api_key: '0',
  funding_account: '',
};

// Strategy definitions
export const defaultStrategyDefinitions: Partial<StrategyDefinition>[] = [
  {
    key: 'pure_market_making',
    name: 'Pure Market Making',
    description: 'Place buy and sell orders on both sides of the order book',
    controllerType: 'pureMarketMaking',
    configSchema: pureMarketMakingSeed.configSchema,
    defaultConfig: pureMarketMakingSeed.defaultConfig,
    capabilities: pureMarketMakingSeed.capabilities,
    enabled: true,
    visibility: StrategyDefinitionVisibility.PUBLIC,
    createdBy: 'seed',
  },
  {
    key: 'arbitrage',
    name: 'Arbitrage',
    description: 'Cross-exchange arbitrage between two exchanges',
    controllerType: 'arbitrage',
    configSchema: arbitrageSeed.configSchema,
    defaultConfig: arbitrageSeed.defaultConfig,
    capabilities: arbitrageSeed.capabilities,
    enabled: true,
    visibility: StrategyDefinitionVisibility.ADMIN,
    createdBy: 'seed',
  },
  {
    key: 'volume',
    name: 'Volume',
    description: 'Generate volume with controlled swaps',
    controllerType: 'volume',
    configSchema: volumeSeed.configSchema,
    defaultConfig: volumeSeed.defaultConfig,
    capabilities: volumeSeed.capabilities,
    enabled: true,
    visibility: StrategyDefinitionVisibility.ADMIN,
    createdBy: 'seed',
  },
  {
    key: 'dual_account_volume',
    name: 'Dual Account Volume',
    description:
      'Generate paired maker/taker volume for admin direct market making',
    controllerType: 'dualAccountVolume',
    configSchema: dualAccountVolumeSeed.configSchema,
    defaultConfig: dualAccountVolumeSeed.defaultConfig,
    capabilities: dualAccountVolumeSeed.capabilities,
    enabled: true,
    visibility: StrategyDefinitionVisibility.ADMIN,
    createdBy: 'seed',
  },
  {
    key: 'dual_account_best_capacity_volume',
    name: 'Dual Account Best Capacity Volume',
    description:
      'Generate paired maker/taker volume using 4-way best executable capacity selection',
    controllerType: 'dualAccountBestCapacityVolume',
    configSchema: dualAccountBestCapacityVolumeSeed.configSchema,
    defaultConfig: dualAccountBestCapacityVolumeSeed.defaultConfig,
    capabilities: dualAccountBestCapacityVolumeSeed.capabilities,
    enabled: true,
    visibility: StrategyDefinitionVisibility.ADMIN,
    createdBy: 'seed',
  },
  {
    key: 'time_indicator',
    name: 'Time Indicator',
    description: 'Trade based on EMA/RSI indicators',
    controllerType: 'timeIndicator',
    configSchema: timeIndicatorSeed.configSchema,
    defaultConfig: timeIndicatorSeed.defaultConfig,
    capabilities: timeIndicatorSeed.capabilities,
    enabled: true,
    visibility: StrategyDefinitionVisibility.ADMIN,
    createdBy: 'seed',
  },
];

// Legacy exports - will be removed after migration
export const defaultSpotdataTradingPairs: SpotdataTradingPair[] = [];
export const defaultMarketMakingPairs: GrowdataMarketMakingPair[] = [];

// Re-export for convenience
export { TRADING_PAIRS } from './data/assets';
export { TOP_EXCHANGES } from './data/exchanges';
