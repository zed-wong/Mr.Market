import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DataSource } from 'typeorm';

import { CustomConfigEntity } from '../src/common/entities/admin/custom-config.entity';
import {
  GrowdataExchange,
  GrowdataMarketMakingPair,
  GrowdataSimplyGrowToken,
} from '../src/common/entities/data/grow-data.entity';
import { SpotdataTradingPair } from '../src/common/entities/data/spot-data.entity';

describe('Database migration and seed scripts (e2e)', () => {
  jest.setTimeout(240000);

  const serverRoot = path.resolve(__dirname, '..');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-market-migrate-'));
  const dbPath = path.join(tempDir, 'migration-seed-test.db');

  const runCommand = (command: string) => {
    execSync(command, {
      cwd: serverRoot,
      env: {
        ...process.env,
        DATABASE_PATH: dbPath,
      },
      stdio: 'pipe',
    });
  };

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  it('runs migration:run and creates expected tables', async () => {
    runCommand('bun run migration:run');

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

    expect(migrationsTable).toHaveLength(1);
    expect(paymentStateTable).toHaveLength(1);

    await dataSource.destroy();
  });

  it('runs migration:seed and inserts baseline rows', async () => {
    runCommand('bun run migration:seed');

    const dataSource = new DataSource({
      type: 'sqlite',
      database: dbPath,
      entities: [
        SpotdataTradingPair,
        GrowdataExchange,
        GrowdataMarketMakingPair,
        GrowdataSimplyGrowToken,
        CustomConfigEntity,
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

    expect(spotPairs).toBeGreaterThan(0);
    expect(exchanges).toBeGreaterThan(0);
    expect(mmPairs).toBeGreaterThan(0);
    expect(simplyGrowTokens).toBeGreaterThan(0);
    expect(customConfigs).toBeGreaterThan(0);

    await dataSource.destroy();
  });
});
