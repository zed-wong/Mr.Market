import { DataSource } from 'typeorm';

import { RemoveLegacyDualAccountVolumeDefinitions1781000000000 } from './1781000000000-RemoveLegacyDualAccountVolumeDefinitions';

describe('RemoveLegacyDualAccountVolumeDefinitions1781000000000', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
    });
    await dataSource.initialize();
    await dataSource.query(`
      CREATE TABLE "strategy_definitions" (
        "id" varchar PRIMARY KEY NOT NULL,
        "key" varchar NOT NULL,
        "name" varchar NOT NULL,
        "description" varchar,
        "controllerType" varchar NOT NULL,
        "configSchema" text NOT NULL,
        "defaultConfig" text NOT NULL,
        "capabilities" text,
        "enabled" boolean NOT NULL DEFAULT (1),
        "visibility" varchar NOT NULL DEFAULT ('admin'),
        "createdBy" varchar,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL
      )
    `);
    await dataSource.query(`
      CREATE TABLE "strategy_instances" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "strategyKey" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "clientId" varchar NOT NULL,
        "strategyType" varchar NOT NULL,
        "status" varchar NOT NULL,
        "parameters" text NOT NULL,
        "startPrice" integer NOT NULL,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL
      )
    `);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('deletes legacy direct definitions and fails active legacy instances', async () => {
    await dataSource.query(
      `INSERT INTO "strategy_definitions" (
        "id",
        "key",
        "name",
        "controllerType",
        "configSchema",
        "defaultConfig",
        "enabled",
        "visibility",
        "createdAt",
        "updatedAt"
      ) VALUES
        (?, ?, ?, ?, '{}', '{}', 1, 'admin', ?, ?),
        (?, ?, ?, ?, '{}', '{}', 1, 'admin', ?, ?),
        (?, ?, ?, ?, '{}', '{}', 1, 'admin', ?, ?)`,
      [
        'legacy-classic',
        'dual_account_volume',
        'Dual Account Volume',
        'dualAccountVolume',
        '2026-06-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
        'legacy-best',
        'dual_account_best_capacity_volume',
        'Dual Account Best Capacity Volume',
        'dualAccountBestCapacityVolume',
        '2026-06-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
        'efficient',
        'efficient_dual_account_volume',
        'Efficient Dual Account Volume',
        'efficientDualAccountVolume',
        '2026-06-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
      ],
    );
    await dataSource.query(
      `INSERT INTO "strategy_instances" (
        "strategyKey",
        "userId",
        "clientId",
        "strategyType",
        "status",
        "parameters",
        "startPrice",
        "createdAt",
        "updatedAt"
      ) VALUES
        (?, 'u1', 'c1', ?, 'running', '{}', 0, ?, ?),
        (?, 'u1', 'c2', ?, 'stopping', '{}', 0, ?, ?),
        (?, 'u1', 'c3', ?, 'running', '{}', 0, ?, ?)`,
      [
        'legacy-classic-key',
        'dualAccountVolume',
        '2026-06-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
        'legacy-best-key',
        'dualAccountBestCapacityVolume',
        '2026-06-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
        'efficient-key',
        'efficientDualAccountVolume',
        '2026-06-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
      ],
    );

    const queryRunner = dataSource.createQueryRunner();
    await new RemoveLegacyDualAccountVolumeDefinitions1781000000000().up(
      queryRunner,
    );
    await queryRunner.release();

    const definitions = await dataSource.query(
      `SELECT "key", "controllerType" FROM "strategy_definitions" ORDER BY "key"`,
    );
    const instances = await dataSource.query(
      `SELECT "strategyKey", "status" FROM "strategy_instances" ORDER BY "strategyKey"`,
    );

    expect(definitions).toEqual([
      {
        key: 'efficient_dual_account_volume',
        controllerType: 'efficientDualAccountVolume',
      },
    ]);
    expect(instances).toEqual([
      { strategyKey: 'efficient-key', status: 'running' },
      { strategyKey: 'legacy-best-key', status: 'failed' },
      { strategyKey: 'legacy-classic-key', status: 'failed' },
    ]);
  });
});
