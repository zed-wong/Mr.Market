import { DataSource } from 'typeorm';

import { BackfillPureMarketMakingDefinition1780800000000 } from './1780800000000-BackfillPureMarketMakingDefinition';

describe('BackfillPureMarketMakingDefinition1780800000000', () => {
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

  it('inserts Pure Market Making for existing DBs that only have efficient direct strategy', async () => {
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
        (?, ?, ?, ?, ?, ?, ?, 1, 'admin', ?, ?),
        (?, ?, ?, ?, ?, ?, ?, 1, 'admin', ?, ?)`,
      [
        'strategy-efficient',
        'efficient_dual_account_volume',
        'Efficient Dual Account Volume',
        'efficientDualAccountVolume',
        '{}',
        '{}',
        JSON.stringify({
          launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
          directExecutionMode: 'dual_account',
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
    await new BackfillPureMarketMakingDefinition1780800000000().up(queryRunner);
    await queryRunner.release();

    const rows = await dataSource.query(
      `SELECT "key", "name", "controllerType", "capabilities", "enabled", "visibility"
       FROM "strategy_definitions"
       ORDER BY "key"`,
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'pure_market_making',
          name: 'Pure Market Making',
          controllerType: 'pureMarketMaking',
          enabled: 1,
          visibility: 'public',
        }),
        expect.objectContaining({
          key: 'efficient_dual_account_volume',
          controllerType: 'efficientDualAccountVolume',
        }),
      ]),
    );
    const pure = rows.find(
      (row: { controllerType: string }) =>
        row.controllerType === 'pureMarketMaking',
    );
    expect(JSON.parse(pure.capabilities)).toEqual({
      launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
      directExecutionMode: 'single_account',
    });
    expect(
      rows.find(
        (row: { controllerType: string }) =>
          row.controllerType === 'dualAccountVolume',
      ),
    ).toBeDefined();
  });
});
