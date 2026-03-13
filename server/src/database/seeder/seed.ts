/* eslint-disable no-console */
// This file is used to seed the database with initial data
// Make sure to run this file after the database and the table is created (after migration:run)

import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, Repository } from 'typeorm';

import { CustomConfigEntity } from '../../common/entities/admin/custom-config.entity';
import {
  GrowdataArbitragePair,
  GrowdataExchange,
  GrowdataMarketMakingPair,
  GrowdataSimplyGrowToken,
} from '../../common/entities/data/grow-data.entity';
import { SpotdataTradingPair } from '../../common/entities/data/spot-data.entity';
import { StrategyDefinition } from '../../common/entities/market-making/strategy-definition.entity';
import { StrategyDefinitionVersion } from '../../common/entities/market-making/strategy-definition-version.entity';
import { POPULAR_ASSETS, TRADING_PAIRS } from './data/assets';
import { TOP_EXCHANGES } from './data/exchanges';
import {
  defaultCustomConfig,
  defaultSimplyGrowTokens,
  defaultStrategyDefinitions,
} from './defaultSeedValues';
import { fetchMarketInfo } from './ccxt-fetcher';

export async function connectToDatabase() {
  dotenv.config();
  const dbPath = process.env.DATABASE_PATH || 'data/mr_market.db';
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dataSource = new DataSource({
    type: 'sqlite',
    database: dbPath,
    entities: [
      GrowdataExchange,
      GrowdataMarketMakingPair,
      GrowdataArbitragePair,
      GrowdataSimplyGrowToken,
      SpotdataTradingPair,
      CustomConfigEntity,
      StrategyDefinition,
      StrategyDefinitionVersion,
    ],
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log('Connected to the database successfully!');

    return dataSource;
  } catch (error) {
    console.error('Error connecting to the database', error);
    throw error;
  }
}

export async function seedGrowdataExchange(
  repository: Repository<GrowdataExchange>,
) {
  for (const exchange of TOP_EXCHANGES) {
    const exists = await repository.findOneBy({
      exchange_id: exchange.exchange_id,
    });

    if (!exists) {
      await repository.save({
        exchange_id: exchange.exchange_id,
        name: exchange.name,
        icon_url: exchange.icon_url,
        enable: exchange.enable,
      });
    }
  }
  console.log(`Seeding GrowdataExchange complete! (${TOP_EXCHANGES.length} exchanges)`);
}

export async function seedGrowdataMarketMakingPair(
  repository: Repository<GrowdataMarketMakingPair>,
) {
  console.log('Seeding market making pairs dynamically from CCXT...');

  let seededCount = 0;

  for (const exchange of TOP_EXCHANGES) {
    for (const pairSymbol of TRADING_PAIRS) {
      const [baseSymbol, quoteSymbol] = pairSymbol.split('/');

      // Skip if we don't have asset info
      const baseAsset = POPULAR_ASSETS[baseSymbol as keyof typeof POPULAR_ASSETS];
      const quoteAsset = POPULAR_ASSETS[quoteSymbol as keyof typeof POPULAR_ASSETS];

      if (!baseAsset || !quoteAsset) {
        continue;
      }

      // Check if pair already exists
      const exists = await repository.findOneBy({
        exchange_id: exchange.exchange_id,
        symbol: pairSymbol,
      });

      if (exists) {
        continue;
      }

      // Fetch market info from CCXT
      const marketInfo = await fetchMarketInfo(exchange.exchange_id, pairSymbol);

      if (!marketInfo) {
        console.log(`  Skipping ${pairSymbol} on ${exchange.name} (not available)`);
        continue;
      }

      // Create market making pair
      await repository.save({
        id: randomUUID(),
        exchange_id: exchange.exchange_id,
        symbol: pairSymbol,
        base_symbol: baseSymbol,
        quote_symbol: quoteSymbol,
        base_asset_id: baseAsset.asset_id,
        base_icon_url: baseAsset.icon_url,
        base_chain_id: '',
        base_chain_icon_url: '',
        quote_asset_id: quoteAsset.asset_id,
        quote_icon_url: quoteAsset.icon_url,
        quote_chain_id: '',
        quote_chain_icon_url: '',
        base_price: '',
        target_price: '',
        custom_fee_rate: '',
        enable: true,
      });

      seededCount++;
      console.log(`  Added ${pairSymbol} on ${exchange.name}`);
    }
  }

  console.log(`Seeding GrowdataMarketMakingPair complete! (${seededCount} pairs)`);
}

export async function seedSpotdataTradingPair(
  repository: Repository<SpotdataTradingPair>,
) {
  console.log('Seeding spot trading pairs dynamically from CCXT...');

  let seededCount = 0;

  for (const exchange of TOP_EXCHANGES) {
    for (const pairSymbol of TRADING_PAIRS) {
      const [baseSymbol, quoteSymbol] = pairSymbol.split('/');

      // Skip if we don't have asset info
      const baseAsset = POPULAR_ASSETS[baseSymbol as keyof typeof POPULAR_ASSETS];
      const quoteAsset = POPULAR_ASSETS[quoteSymbol as keyof typeof POPULAR_ASSETS];

      if (!baseAsset || !quoteAsset) {
        continue;
      }

      // Check if pair already exists
      const exists = await repository.findOneBy({
        exchange_id: exchange.exchange_id,
        symbol: pairSymbol,
      });

      if (exists) {
        continue;
      }

      // Fetch market info from CCXT
      const marketInfo = await fetchMarketInfo(exchange.exchange_id, pairSymbol);

      if (!marketInfo) {
        continue; // Silently skip, already logged in market making pair
      }

      // Calculate precision and limits from CCXT data
      const pricePrecision = String(marketInfo.precision.price ?? 8);
      const amountPrecision = String(marketInfo.precision.amount ?? 8);

      // Create spot trading pair
      await repository.save({
        id: randomUUID(),
        ccxt_id: pairSymbol,
        symbol: pairSymbol,
        exchange_id: exchange.exchange_id,
        amount_significant_figures: amountPrecision,
        price_significant_figures: pricePrecision,
        buy_decimal_digits: pricePrecision,
        sell_decimal_digits: pricePrecision,
        max_buy_amount: String(marketInfo.limits.amount.max ?? 0),
        max_sell_amount: String(marketInfo.limits.amount.max ?? 0),
        base_asset_id: baseAsset.asset_id,
        quote_asset_id: quoteAsset.asset_id,
        custom_fee_rate: '',
        enable: true,
      });

      seededCount++;
    }
  }

  console.log(`Seeding SpotdataTradingPair complete! (${seededCount} pairs)`);
}

export async function seedGrowdataSimplyGrowToken(
  repository: Repository<GrowdataSimplyGrowToken>,
) {
  for (const token of defaultSimplyGrowTokens) {
    const exists = await repository.findOneBy({ asset_id: token.asset_id });

    if (!exists) {
      await repository.save(token);
    }
  }
  console.log('Seeding GrowdataSimplyGrowToken complete!');
}

export async function seedCustomConfig(
  repository: Repository<CustomConfigEntity>,
) {
  const exists = await repository.findOneBy({
    config_id: defaultCustomConfig.config_id,
  });

  if (!exists) {
    await repository.save(defaultCustomConfig);
  }
  console.log('Seeding CustomConfigEntity complete!');
}

export async function seedStrategyDefinitions(
  repository: Repository<StrategyDefinition>,
  versionRepository: Repository<StrategyDefinitionVersion>,
) {
  for (const definition of defaultStrategyDefinitions) {
    let saved = await repository.findOneBy({ key: definition.key });

    if (!saved) {
      saved = await repository.save(
        repository.create({
          key: String(definition.key),
          name: String(definition.name),
          description: definition.description
            ? String(definition.description)
            : undefined,
          controllerType: String(
            definition.controllerType || definition.executorType,
          ),
          configSchema: (definition.configSchema || {}) as Record<
            string,
            unknown
          >,
          defaultConfig: (definition.defaultConfig || {}) as Record<
            string,
            unknown
          >,
          enabled: definition.enabled !== false,
          visibility: String(definition.visibility || 'system'),
          currentVersion: '1.0.0',
          createdBy: definition.createdBy
            ? String(definition.createdBy)
            : undefined,
        }),
      );
    }

    const versionExists = await versionRepository.findOneBy({
      definitionId: saved.id,
      version: saved.currentVersion || '1.0.0',
    });

    if (!versionExists) {
      await versionRepository.save(
        versionRepository.create({
          definitionId: saved.id,
          version: saved.currentVersion || '1.0.0',
          controllerType: saved.controllerType,
          configSchema: saved.configSchema,
          defaultConfig: saved.defaultConfig,
          description: saved.description,
        }),
      );
    }
  }
  console.log('Seeding StrategyDefinition complete!');
}

export async function runSeed() {
  console.log('Starting database seed...\n');

  const dataSource = await connectToDatabase();

  // Seed static data first
  await seedGrowdataExchange(dataSource.getRepository(GrowdataExchange));
  await seedGrowdataSimplyGrowToken(
    dataSource.getRepository(GrowdataSimplyGrowToken),
  );
  await seedCustomConfig(dataSource.getRepository(CustomConfigEntity));
  await seedStrategyDefinitions(
    dataSource.getRepository(StrategyDefinition),
    dataSource.getRepository(StrategyDefinitionVersion),
  );

  // Seed dynamic data from CCXT
  await seedGrowdataMarketMakingPair(
    dataSource.getRepository(GrowdataMarketMakingPair),
  );
  await seedSpotdataTradingPair(dataSource.getRepository(SpotdataTradingPair));

  await dataSource.destroy();
  console.log('\nDatabase seed complete!');
}

if (require.main === module) {
  runSeed().catch((error) => {
    console.error('Seed run failed', error);
    process.exit(1);
  });
}
