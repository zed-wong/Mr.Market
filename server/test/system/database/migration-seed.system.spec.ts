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
      .filter((file) => file.endsWith('.ts'))
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

    log.result('migration tables inspected', {
      migrationsTableCount: migrationsTable.length,
      paymentStateTableCount: paymentStateTable.length,
    });

    expect(migrationsTable).toHaveLength(1);
    expect(paymentStateTable).toHaveLength(1);

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
    expect(pureMarketMakingDefinition.defaultConfig).toEqual(
      expect.objectContaining({
        pair: 'BTC/USDT',
        exchangeName: 'binance',
      }),
    );

    await dataSource.destroy();
  });
});
