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
import { fetchMarketInfo, MarketInfo } from './ccxt-fetcher';

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
  const existingIds = (
    await repository.find({
      select: ['exchange_id'],
    })
  ).map((e) => e.exchange_id);

  const toInsert = TOP_EXCHANGES.filter(
    (e) => !existingIds.includes(e.exchange_id),
  );

  if (toInsert.length > 0) {
    await repository.save(
      toInsert.map((e) => ({
        exchange_id: e.exchange_id,
        name: e.name,
        icon_url: e.icon_url,
        enable: e.enable,
      })),
    );
  }

  console.log(
    `Seeding GrowdataExchange complete! (${TOP_EXCHANGES.length} exchanges)`,
  );
}

interface PairSeedData {
  exchangeId: string;
  exchangeName: string;
  pairSymbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseAsset: (typeof POPULAR_ASSETS)[keyof typeof POPULAR_ASSETS];
  quoteAsset: (typeof POPULAR_ASSETS)[keyof typeof POPULAR_ASSETS];
  marketInfo: MarketInfo;
}

async function fetchAllMarketInfoConcurrently(): Promise<PairSeedData[]> {
  const results: PairSeedData[] = [];

  // Create all fetch tasks
  const fetchTasks: Promise<PairSeedData | null>[] = [];

  for (const exchange of TOP_EXCHANGES) {
    for (const pairSymbol of TRADING_PAIRS) {
      const [baseSymbol, quoteSymbol] = pairSymbol.split('/');

      const baseAsset = POPULAR_ASSETS[baseSymbol as keyof typeof POPULAR_ASSETS];
      const quoteAsset = POPULAR_ASSETS[quoteSymbol as keyof typeof POPULAR_ASSETS];

      if (!baseAsset || !quoteAsset) {
        continue;
      }

      fetchTasks.push(
        fetchMarketInfo(exchange.exchange_id, pairSymbol).then(
          (marketInfo): PairSeedData | null => {
            if (!marketInfo) return null;

            return {
              exchangeId: exchange.exchange_id,
              exchangeName: exchange.name,
              pairSymbol,
              baseSymbol,
              quoteSymbol,
              baseAsset,
              quoteAsset,
              marketInfo,
            };
          },
        ),
      );
    }
  }

  console.log(
    `Fetching market info for ${fetchTasks.length} pairs concurrently...`,
  );

  // Execute all fetches concurrently with a concurrency limit
  const CONCURRENCY_LIMIT = 20;
  const batches: Promise<PairSeedData | null>[][] = [];

  for (let i = 0; i < fetchTasks.length; i += CONCURRENCY_LIMIT) {
    batches.push(fetchTasks.slice(i, i + CONCURRENCY_LIMIT));
  }

  for (const batch of batches) {
    const batchResults = await Promise.all(batch);
    results.push(
      ...batchResults.filter((r): r is PairSeedData => r !== null),
    );
  }

  console.log(`Fetched ${results.length} valid pairs from CCXT`);

  return results;
}

export async function seedGrowdataMarketMakingPair(
  repository: Repository<GrowdataMarketMakingPair>,
  marketData: PairSeedData[],
) {
  console.log('Seeding market making pairs...');

  // Get existing pairs
  const existing = await repository.find({
    select: ['exchange_id', 'symbol'],
  });

  const existingKeys = new Set(
    existing.map((p) => `${p.exchange_id}:${p.symbol}`),
  );

  const toInsert = marketData
    .filter((d) => !existingKeys.has(`${d.exchangeId}:${d.pairSymbol}`))
    .map((d) => ({
      id: randomUUID(),
      exchange_id: d.exchangeId,
      symbol: d.pairSymbol,
      base_symbol: d.baseSymbol,
      quote_symbol: d.quoteSymbol,
      base_asset_id: d.baseAsset.asset_id,
      base_icon_url: d.baseAsset.icon_url,
      base_chain_id: '',
      base_chain_icon_url: '',
      quote_asset_id: d.quoteAsset.asset_id,
      quote_icon_url: d.quoteAsset.icon_url,
      quote_chain_id: '',
      quote_chain_icon_url: '',
      base_price: '',
      target_price: '',
      custom_fee_rate: '',
      enable: true,
    }));

  if (toInsert.length > 0) {
    await repository.save(toInsert);
  }

  console.log(
    `Seeding GrowdataMarketMakingPair complete! (${toInsert.length} new pairs)`,
  );
}

export async function seedSpotdataTradingPair(
  repository: Repository<SpotdataTradingPair>,
  marketData: PairSeedData[],
) {
  console.log('Seeding spot trading pairs...');

  // Get existing pairs
  const existing = await repository.find({
    select: ['exchange_id', 'symbol'],
  });

  const existingKeys = new Set(
    existing.map((p) => `${p.exchange_id}:${p.symbol}`),
  );

  const toInsert = marketData
    .filter((d) => !existingKeys.has(`${d.exchangeId}:${d.pairSymbol}`))
    .map((d) => {
      const pricePrecision = String(d.marketInfo.precision.price ?? 8);
      const amountPrecision = String(d.marketInfo.precision.amount ?? 8);

      return {
        id: randomUUID(),
        ccxt_id: d.pairSymbol,
        symbol: d.pairSymbol,
        exchange_id: d.exchangeId,
        amount_significant_figures: amountPrecision,
        price_significant_figures: pricePrecision,
        buy_decimal_digits: pricePrecision,
        sell_decimal_digits: pricePrecision,
        max_buy_amount: String(d.marketInfo.limits.amount.max ?? 0),
        max_sell_amount: String(d.marketInfo.limits.amount.max ?? 0),
        base_asset_id: d.baseAsset.asset_id,
        quote_asset_id: d.quoteAsset.asset_id,
        custom_fee_rate: '',
        enable: true,
      };
    });

  if (toInsert.length > 0) {
    await repository.save(toInsert);
  }

  console.log(
    `Seeding SpotdataTradingPair complete! (${toInsert.length} new pairs)`,
  );
}

export async function seedGrowdataSimplyGrowToken(
  repository: Repository<GrowdataSimplyGrowToken>,
) {
  const existingIds = (
    await repository.find({
      select: ['asset_id'],
    })
  ).map((t) => t.asset_id);

  const toInsert = defaultSimplyGrowTokens.filter(
    (t) => !existingIds.includes(t.asset_id),
  );

  if (toInsert.length > 0) {
    await repository.save(toInsert);
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
  const existingKeys = (
    await repository.find({
      select: ['key'],
    })
  ).map((d) => d.key);

  for (const definition of defaultStrategyDefinitions) {
    if (existingKeys.includes(String(definition.key))) {
      continue;
    }

    const saved = await repository.save(
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

  console.log('Seeding StrategyDefinition complete!');
}

export async function runSeed() {
  console.log('Starting database seed...\n');

  const dataSource = await connectToDatabase();

  // Seed static data in parallel
  await Promise.all([
    seedGrowdataExchange(dataSource.getRepository(GrowdataExchange)),
    seedGrowdataSimplyGrowToken(
      dataSource.getRepository(GrowdataSimplyGrowToken),
    ),
    seedCustomConfig(dataSource.getRepository(CustomConfigEntity)),
  ]);

  // Seed strategy definitions (has dependencies)
  await seedStrategyDefinitions(
    dataSource.getRepository(StrategyDefinition),
    dataSource.getRepository(StrategyDefinitionVersion),
  );

  // Fetch all market info concurrently (this is the slow part)
  const marketData = await fetchAllMarketInfoConcurrently();

  // Seed dynamic data in parallel
  await Promise.all([
    seedGrowdataMarketMakingPair(
      dataSource.getRepository(GrowdataMarketMakingPair),
      marketData,
    ),
    seedSpotdataTradingPair(
      dataSource.getRepository(SpotdataTradingPair),
      marketData,
    ),
  ]);

  await dataSource.destroy();
  console.log('\nDatabase seed complete!');
}

if (require.main === module) {
  runSeed().catch((error) => {
    console.error('Seed run failed', error);
    process.exit(1);
  });
}
