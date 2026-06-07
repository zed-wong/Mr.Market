import { DataSource } from 'typeorm';

import { BackfillEfficientDualAccountDefinition1780700000000 } from './1780700000000-BackfillEfficientDualAccountDefinition';

describe('BackfillEfficientDualAccountDefinition1780700000000', () => {
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
    await dataSource.query(
      `CREATE UNIQUE INDEX "IDX_strategy_definitions_key" ON "strategy_definitions" ("key")`,
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('inserts Efficient Dual Account Volume for existing DBs that only have legacy direct strategies', async () => {
    await dataSource.query(
      `INSERT INTO "strategy_definitions" (
        "id",
        "key",
        "name",
        "controllerType",
        "configSchema",
        "defaultConfig",
        "capabilities",
        "enabled",
        "visibility",
        "createdAt",
        "updatedAt"
      ) VALUES
        (?, ?, ?, ?, ?, ?, ?, 1, 'public', ?, ?),
        (?, ?, ?, ?, ?, ?, ?, 1, 'admin', ?, ?)`,
      [
        'strategy-pmm',
        'pure_market_making',
        'Pure Market Making',
        'pureMarketMaking',
        '{}',
        '{}',
        JSON.stringify({
          launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
          directExecutionMode: 'single_account',
        }),
        '2026-06-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
        'strategy-legacy-dual',
        'dual_account_volume',
        'Dual Account Volume',
        'dualAccountVolume',
        '{}',
        '{}',
        JSON.stringify({
          launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
          directExecutionMode: 'dual_account',
        }),
        '2026-06-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
      ],
    );

    const queryRunner = dataSource.createQueryRunner();
    await new BackfillEfficientDualAccountDefinition1780700000000().up(
      queryRunner,
    );
    await queryRunner.release();

    const rows = await dataSource.query(
      `SELECT "key", "name", "controllerType", "capabilities", "enabled", "visibility"
       FROM "strategy_definitions"
       ORDER BY "key"`,
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'efficient_dual_account_volume',
          name: 'Efficient Dual Account Volume',
          controllerType: 'efficientDualAccountVolume',
          enabled: 1,
          visibility: 'admin',
        }),
      ]),
    );
    const efficient = rows.find(
      (row: { controllerType: string }) =>
        row.controllerType === 'efficientDualAccountVolume',
    );
    expect(JSON.parse(efficient.capabilities)).toEqual({
      launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
      directExecutionMode: 'dual_account',
    });
  });
});
