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
import { fetchAllMarkets, MarketInfo } from './ccxt-fetcher';
import { TRADING_PAIRS } from './data/assets';
import { TOP_EXCHANGES } from './data/exchanges';
import {
  defaultCustomConfig,
  defaultStrategyDefinitions,
} from './default-seed-values';
import { fetchMixinAssets, getChainIconUrl, MixinAsset } from './mixin-fetcher';

// Logger helpers
const log = {
  step: (msg: string) => console.log(`\n▸ ${msg}`),
  success: (msg: string) => console.log(`  ✓ ${msg}`),
  info: (msg: string) => console.log(`  → ${msg}`),
  error: (msg: string) => console.error(`  ✗ ${msg}`),
  header: (msg: string) => {
    const line = '═'.repeat(msg.length + 4);

    console.log(`\n╔${line}╗`);
    console.log(`║  ${msg}  ║`);
    console.log(`╚${line}╝\n`);
  },
};

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
    ],
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    log.success(`Connected to database: ${dbPath}`);

    return dataSource;
  } catch (error) {
    log.error(
      `Failed to connect: ${error instanceof Error ? error.message : error}`,
    );
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

  log.success(
    `Exchanges: ${toInsert.length} inserted, ${existingIds.length} existing`,
  );
}

interface PairSeedData {
  exchangeId: string;
  exchangeName: string;
  pairSymbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseAsset: MixinAsset;
  quoteAsset: MixinAsset;
  baseChainIconUrl: string;
  quoteChainIconUrl: string;
  marketInfo: MarketInfo;
}

/**
 * Build seed data by combining:
 * 1. Mixin API (asset_id, chain_id, icon_url)
 * 2. CCXT API (precision, limits)
 */
async function buildPairSeedData(
  mixinAssets: Map<string, MixinAsset>,
): Promise<PairSeedData[]> {
  const results: PairSeedData[] = [];

  const exchangeIds = TOP_EXCHANGES.map((e) => e.exchange_id);
  const symbols = [...TRADING_PAIRS];

  log.info(
    `Loading markets for ${exchangeIds.length} exchanges × ${symbols.length} symbols...`,
  );

  // Fetch all markets from CCXT (cached per exchange)
  const marketsMap = await fetchAllMarkets(exchangeIds, symbols, 300);

  // Build PairSeedData by combining Mixin + CCXT data
  for (const exchange of TOP_EXCHANGES) {
    const exchangeMarkets = marketsMap.get(exchange.exchange_id);

    if (!exchangeMarkets) continue;

    for (const pairSymbol of TRADING_PAIRS) {
      const [baseSymbol, quoteSymbol] = pairSymbol.split('/');

      // Get asset info from Mixin API
      const baseAsset = mixinAssets.get(baseSymbol.toUpperCase());
      const quoteAsset = mixinAssets.get(quoteSymbol.toUpperCase());

      if (!baseAsset || !quoteAsset) {
        continue;
      }

      // Get market info from CCXT
      const marketInfo = exchangeMarkets.get(pairSymbol);

      if (!marketInfo) continue;

      // Get chain icon URLs
      const baseChainIconUrl = await getChainIconUrl(baseAsset.chain_id);
      const quoteChainIconUrl = await getChainIconUrl(quoteAsset.chain_id);

      results.push({
        exchangeId: exchange.exchange_id,
        exchangeName: exchange.name,
        pairSymbol,
        baseSymbol,
        quoteSymbol,
        baseAsset,
        quoteAsset,
        baseChainIconUrl,
        quoteChainIconUrl,
        marketInfo,
      });
    }
  }

  log.success(`Found ${results.length} valid trading pairs`);

  return results;
}

export async function seedGrowdataMarketMakingPair(
  repository: Repository<GrowdataMarketMakingPair>,
  marketData: PairSeedData[],
) {
  const existing = await repository.find({
    select: ['id', 'exchange_id', 'symbol'],
  });

  const existingKeys = new Set(
    existing.map((p) => `${p.exchange_id}:${p.symbol}`),
  );
  const existingIdByKey = new Map(
    existing.map((p) => [`${p.exchange_id}:${p.symbol}`, p.id]),
  );

  const toSave = marketData.map((d) => ({
    id: existingIdByKey.get(`${d.exchangeId}:${d.pairSymbol}`) || randomUUID(),
    exchange_id: d.exchangeId,
    symbol: d.pairSymbol,
    base_symbol: d.baseSymbol,
    quote_symbol: d.quoteSymbol,
    base_asset_id: d.baseAsset.asset_id,
    base_icon_url: d.baseAsset.icon_url,
    base_chain_id: d.baseAsset.chain_id,
    base_chain_icon_url: d.baseChainIconUrl,
    quote_asset_id: d.quoteAsset.asset_id,
    quote_icon_url: d.quoteAsset.icon_url,
    quote_chain_id: d.quoteAsset.chain_id,
    quote_chain_icon_url: d.quoteChainIconUrl,
    base_price: '',
    target_price: '',
    custom_fee_rate: '',
    min_order_amount: String(d.marketInfo.limits.amount.min ?? ''),
    max_order_amount: String(d.marketInfo.limits.amount.max ?? ''),
    amount_significant_figures: String(d.marketInfo.precision.amount ?? 8),
    price_significant_figures: String(d.marketInfo.precision.price ?? 8),
    enable: true,
  }));

  if (toSave.length > 0) {
    await repository.save(toSave);
  }

  const insertedCount = marketData.filter(
    (d) => !existingKeys.has(`${d.exchangeId}:${d.pairSymbol}`),
  ).length;

  log.success(
    `Market Making Pairs: ${insertedCount} inserted, ${existing.length} existing`,
  );
}

export async function seedSpotdataTradingPair(
  repository: Repository<SpotdataTradingPair>,
  marketData: PairSeedData[],
) {
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

  log.success(
    `Spot Trading Pairs: ${toInsert.length} inserted, ${existing.length} existing`,
  );
}

export async function seedGrowdataSimplyGrowToken(
  repository: Repository<GrowdataSimplyGrowToken>,
  mixinAssets: Map<string, MixinAsset>,
) {
  // Get existing tokens
  const existingIds = (
    await repository.find({
      select: ['asset_id'],
    })
  ).map((t) => t.asset_id);

  // Use Mixin assets for tokens that are in our trading pairs
  const symbolsToSeed = new Set<string>();

  for (const pair of TRADING_PAIRS) {
    const [base, quote] = pair.split('/');

    symbolsToSeed.add(base.toUpperCase());
    symbolsToSeed.add(quote.toUpperCase());
  }

  const toInsert: GrowdataSimplyGrowToken[] = [];

  for (const symbol of symbolsToSeed) {
    const asset = mixinAssets.get(symbol);

    if (!asset || existingIds.includes(asset.asset_id)) {
      continue;
    }

    toInsert.push({
      asset_id: asset.asset_id,
      name: asset.name,
      symbol: asset.symbol,
      icon_url: asset.icon_url,
      apy: '',
      enable: true,
    });
  }

  if (toInsert.length > 0) {
    await repository.save(toInsert);
  }

  log.success(
    `SimplyGrow Tokens: ${toInsert.length} inserted, ${existingIds.length} existing`,
  );
}

export async function seedCustomConfig(
  repository: Repository<CustomConfigEntity>,
) {
  const exists = await repository.findOneBy({
    config_id: defaultCustomConfig.config_id,
  });

  if (!exists) {
    await repository.save(defaultCustomConfig);
    log.success('Custom Config: inserted');
  } else {
    log.success('Custom Config: already exists');
  }
}

export async function seedStrategyDefinitions(
  repository: Repository<StrategyDefinition>,
) {
  const existingKeys = (
    await repository.find({
      select: ['key'],
    })
  ).map((d) => d.key);

  let inserted = 0;

  for (const definition of defaultStrategyDefinitions) {
    if (existingKeys.includes(String(definition.key))) {
      continue;
    }

    await repository.save(
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
        createdBy: definition.createdBy
          ? String(definition.createdBy)
          : undefined,
      }),
    );

    inserted++;
  }

  log.success(
    `Strategy Definitions: ${inserted} inserted, ${existingKeys.length} existing`,
  );
}

export async function runSeed() {
  const startTime = Date.now();

  log.header('Database Seed');

  const dataSource = await connectToDatabase();

  // Fetch Mixin assets first (needed for all entity seeding)
  log.step('Fetching assets from Mixin API...');
  const mixinAssets = await fetchMixinAssets();

  // Seed static data
  log.step('Seeding static data...');
  await Promise.all([
    seedGrowdataExchange(dataSource.getRepository(GrowdataExchange)),
    seedGrowdataSimplyGrowToken(
      dataSource.getRepository(GrowdataSimplyGrowToken),
      mixinAssets,
    ),
    seedCustomConfig(dataSource.getRepository(CustomConfigEntity)),
  ]);

  // Seed strategy definitions
  log.step('Seeding strategy definitions...');
  await seedStrategyDefinitions(dataSource.getRepository(StrategyDefinition));

  // Build pair seed data (combines Mixin + CCXT data)
  log.step('Fetching market data from CCXT...');
  const marketData = await buildPairSeedData(mixinAssets);

  // Seed dynamic data
  log.step('Seeding trading pairs...');
  await Promise.all([
    seedGrowdataMarketMakingPair(
      dataSource.getRepository(GrowdataMarketMakingPair),
      marketData,
    ),
    /*
    seedSpotdataTradingPair(
      dataSource.getRepository(SpotdataTradingPair),
      marketData,
    ),
    */
  ]);

  await dataSource.destroy();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  log.header(`Seed Complete (${elapsed}s)`);
}

if (require.main === module) {
  runSeed().catch((error) => {
    log.error(`Seed failed: ${error.message}`);
    process.exit(1);
  });
}
