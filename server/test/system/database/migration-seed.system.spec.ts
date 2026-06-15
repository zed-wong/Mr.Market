import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { DataSource } from 'typeorm';

import { CustomConfigEntity } from '../../../src/common/entities/admin/custom-config.entity';
import {
  GrowdataExchange,
  GrowdataMarketMakingPair,
  GrowdataSimplyGrowToken,
} from '../../../src/common/entities/data/grow-data.entity';
import { SpotdataTradingPair } from '../../../src/common/entities/data/spot-data.entity';
import { StrategyDefinition } from '../../../src/common/entities/market-making/strategy-definition.entity';
import { runSeed } from '../../../src/database/seeder/seed';
import { createSystemTestLogger } from '../helpers/system-test-log.helper';

jest.mock('../../../src/database/seeder/mixin-fetcher', () => {
  const assets = [
    'BTC',
    'ETH',
    'SOL',
    'XRP',
    'DOGE',
    'LTC',
    'AVAX',
    'MATIC',
    'BNB',
    'HMT',
    'XIN',
    'USDT',
  ].map((symbol) => ({
    asset_id: `${symbol.toLowerCase()}-asset-id`,
    chain_id: `${symbol.toLowerCase()}-chain-id`,
    symbol,
    name: symbol,
    icon_url: `https://example.test/${symbol.toLowerCase()}.png`,
    precision: 8,
  }));

  return {
    fetchMixinAssets: jest.fn(async () => {
      return new Map(assets.map((asset) => [asset.symbol, asset]));
    }),
    getChainIconUrl: jest.fn(async (chainId: string) => {
      return `https://example.test/chains/${chainId}.png`;
    }),
  };
});

jest.mock('../../../src/database/seeder/ccxt-fetcher', () => ({
  clearCache: jest.fn(),
  fetchAllMarkets: jest.fn(async (exchangeIds: string[], symbols: string[]) => {
    const markets = new Map();

    for (const exchangeId of exchangeIds) {
      markets.set(
        exchangeId,
        new Map(
          symbols.map((symbol) => {
            const [base, quote] = symbol.split('/');

            return [
              symbol,
              {
                symbol,
                base,
                quote,
                precision: { amount: 6, price: 2 },
                limits: {
                  amount: { min: 0.001, max: 1000 },
                  price: { min: 0.01, max: 1000000 },
                },
              },
            ];
          }),
        ),
      );
    }

    return markets;
  }),
}));

const log = createSystemTestLogger('database-migration-seed');

describe('Database migration and seed scripts', () => {
  jest.setTimeout(240000);

  const serverRoot = path.resolve(__dirname, '../../..');
  const migrationsRoot = path.join(serverRoot, 'src/database/migrations');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-market-migrate-'));
  const dbPath = path.join(tempDir, 'migration-seed-test.db');
  const requireFromTest = createRequire(__filename);

  type MigrationClass = new (...args: never[]) => unknown;

  const loadMigrationClasses = (): MigrationClass[] => {
    return fs
      .readdirSync(migrationsRoot)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .sort()
      .flatMap((file) => {
        const moduleExports = requireFromTest(
          path.join(migrationsRoot, file),
        ) as Record<string, unknown>;

        return Object.values(moduleExports).filter(
          (value): value is MigrationClass => typeof value === 'function',
        );
      });
  };

  const runMigrations = async () => {
    log.step('running typeorm migrations', {
      databasePath: dbPath,
    });
    const dataSource = new DataSource({
      type: 'sqlite',
      database: dbPath,
      synchronize: false,
      migrations: loadMigrationClasses(),
      migrationsTableName: 'migrations_typeorm',
      extra: {
        flags: ['-WAL'],
      },
    });

    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.destroy();
  };

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      log.suite('temporary database removed', {
        tempDir,
      });
    } catch {
      // best effort cleanup
    }
  });

  it('runs migration:run and creates expected tables', async () => {
    await runMigrations();
    log.check('migrations completed');

    const dataSource = new DataSource({
      type: 'sqlite',
      database: dbPath,
      synchronize: false,
    });

    await dataSource.initialize();

    const migrationsTable = (await dataSource.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations_typeorm'",
    )) as Array<{ name: string }>;
    const paymentStateTable = (await dataSource.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='market_making_payment_state'",
    )) as Array<{ name: string }>;
    const web3WithdrawalColumns = (await dataSource.query(
      "PRAGMA table_info('web3_withdrawal')",
    )) as Array<{ name: string }>;

    log.result('migration tables inspected', {
      migrationsTableCount: migrationsTable.length,
      paymentStateTableCount: paymentStateTable.length,
    });

    expect(migrationsTable).toHaveLength(1);
    expect(paymentStateTable).toHaveLength(1);
    expect(web3WithdrawalColumns.map((column) => column.name)).toContain(
      'startBlockNumber',
    );

    await dataSource.destroy();
  });

  it('runs migration:seed and inserts baseline rows', async () => {
    const prevDbPath = process.env.DATABASE_PATH;

    try {
      process.env.DATABASE_PATH = dbPath;
      await runMigrations();
      log.step('running seed data load', {
        databasePath: dbPath,
      });
      await runSeed();
    } finally {
      if (prevDbPath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = prevDbPath;
      }
    }

    const dataSource = new DataSource({
      type: 'sqlite',
      database: dbPath,
      entities: [
        SpotdataTradingPair,
        GrowdataExchange,
        GrowdataMarketMakingPair,
        GrowdataSimplyGrowToken,
        CustomConfigEntity,
        StrategyDefinition,
      ],
      synchronize: false,
    });

    await dataSource.initialize();

    const spotPairs = await dataSource
      .getRepository(SpotdataTradingPair)
      .count();
    const exchanges = await dataSource.getRepository(GrowdataExchange).count();
    const mmPairs = await dataSource
      .getRepository(GrowdataMarketMakingPair)
      .count();
    const simplyGrowTokens = await dataSource
      .getRepository(GrowdataSimplyGrowToken)
      .count();
    const customConfigs = await dataSource
      .getRepository(CustomConfigEntity)
      .count();
    const strategyDefinitions = await dataSource
      .getRepository(StrategyDefinition)
      .count();
    const pureMarketMakingDefinition = await dataSource
      .getRepository(StrategyDefinition)
      .findOneByOrFail({
        key: 'pure_market_making',
      });

    log.result('seed counts collected', {
      exchanges,
      mmPairs,
      simplyGrowTokens,
      customConfigs,
      strategyDefinitions,
      controllerType: pureMarketMakingDefinition.controllerType,
    });

    expect(spotPairs).toBe(0);
    expect(exchanges).toBeGreaterThan(0);
    expect(mmPairs).toBeGreaterThan(0);
    expect(simplyGrowTokens).toBeGreaterThan(0);
    expect(customConfigs).toBeGreaterThan(0);
    expect(strategyDefinitions).toBeGreaterThan(0);
    expect(pureMarketMakingDefinition.controllerType).toBe('pureMarketMaking');
    expect(pureMarketMakingDefinition.configSchema).toEqual(
      expect.objectContaining({
        type: 'object',
        additionalProperties: false,
      }),
    );
    expect(pureMarketMakingDefinition.configSchema).not.toHaveProperty(
      'launchSurfaces',
    );
    expect(pureMarketMakingDefinition.configSchema).not.toHaveProperty(
      'directExecutionMode',
    );
    expect(pureMarketMakingDefinition.capabilities).toEqual({
      launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
      directExecutionMode: 'single_account',
    });
    expect(pureMarketMakingDefinition.defaultConfig).toEqual(
      expect.objectContaining({
        orderAmount: 0.001,
        numberOfLayers: 1,
      }),
    );
    expect(pureMarketMakingDefinition.defaultConfig).not.toHaveProperty(
      'pair',
    );
    expect(pureMarketMakingDefinition.defaultConfig).not.toHaveProperty(
      'exchangeName',
    );

    await dataSource.destroy();
  });
});
