import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';
import {
  GrowdataExchange,
  GrowdataMarketMakingPair,
  GrowdataSimplyGrowToken,
} from 'src/common/entities/data/grow-data.entity';
import { SpotdataTradingPair } from 'src/common/entities/data/spot-data.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';

import { TOP_EXCHANGES as EXCHANGES } from './data/exchanges';
import arbitrageSeedDefinition from './data/strategies/arbitrage.json';
import pureMarketMakingSeedDefinition from './data/strategies/pure-market-making.json';
import timeIndicatorSeedDefinition from './data/strategies/time-indicator.json';
import volumeSeedDefinition from './data/strategies/volume.json';

type SeededStrategyDefinitionConfig = {
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
};

// Export exchanges from data file
export const defaultExchanges: GrowdataExchange[] = EXCHANGES.map((e) => ({
  exchange_id: e.exchange_id,
  name: e.name,
  icon_url: e.icon_url,
  enable: e.enable,
}));

// SimplyGrow tokens - now dynamically fetched from Mixin API in seed.ts
export const defaultSimplyGrowTokens: GrowdataSimplyGrowToken[] = [];

// Custom config
export const defaultCustomConfig: CustomConfigEntity = {
  config_id: 0,
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
    configSchema: (
      pureMarketMakingSeedDefinition as SeededStrategyDefinitionConfig
    ).configSchema,
    defaultConfig: (
      pureMarketMakingSeedDefinition as SeededStrategyDefinitionConfig
    ).defaultConfig,
    enabled: true,
    visibility: 'system',
    createdBy: 'seed',
  },
  {
    key: 'arbitrage',
    name: 'Arbitrage',
    description: 'Cross-exchange arbitrage between two exchanges',
    controllerType: 'arbitrage',
    configSchema: (arbitrageSeedDefinition as SeededStrategyDefinitionConfig)
      .configSchema,
    defaultConfig: (arbitrageSeedDefinition as SeededStrategyDefinitionConfig)
      .defaultConfig,
    enabled: true,
    visibility: 'system',
    createdBy: 'seed',
  },
  {
    key: 'volume',
    name: 'Volume',
    description: 'Generate volume with controlled swaps',
    controllerType: 'volume',
    configSchema: (volumeSeedDefinition as SeededStrategyDefinitionConfig)
      .configSchema,
    defaultConfig: (volumeSeedDefinition as SeededStrategyDefinitionConfig)
      .defaultConfig,
    enabled: true,
    visibility: 'system',
    createdBy: 'seed',
  },
  {
    key: 'time_indicator',
    name: 'Time Indicator',
    description: 'Trade based on EMA/RSI indicators',
    controllerType: 'timeIndicator',
    configSchema: (
      timeIndicatorSeedDefinition as SeededStrategyDefinitionConfig
    ).configSchema,
    defaultConfig: (
      timeIndicatorSeedDefinition as SeededStrategyDefinitionConfig
    ).defaultConfig,
    enabled: true,
    visibility: 'system',
    createdBy: 'seed',
  },
];

// Legacy exports - will be removed after migration
export const defaultSpotdataTradingPairs: SpotdataTradingPair[] = [];
export const defaultMarketMakingPairs: GrowdataMarketMakingPair[] = [];

// Re-export for convenience
export { TRADING_PAIRS } from './data/assets';
export { TOP_EXCHANGES } from './data/exchanges';
