import { DataSource } from 'typeorm';

import { AddLedgerOrderIdentityFields1780900000000 } from './1780900000000-AddLedgerOrderIdentityFields';

type SqliteColumn = {
  name: string;
  notnull: number;
};

describe('AddLedgerOrderIdentityFields1780900000000', () => {
  let dataSource: DataSource;

  const migration = new AddLedgerOrderIdentityFields1780900000000();

  const runMigration = async (direction: 'up' | 'down') => {
    const queryRunner = dataSource.createQueryRunner();

    try {
      await migration[direction](queryRunner);
    } finally {
      await queryRunner.release();
    }
  };

  const tableColumns = async (table: string): Promise<SqliteColumn[]> =>
    dataSource.query(`PRAGMA table_info("${table}")`);

  const columnNames = async (table: string): Promise<string[]> =>
    (await tableColumns(table)).map((column) => column.name);

  const requireColumn = async (
    table: string,
    columnName: string,
  ): Promise<SqliteColumn> => {
    const column = (await tableColumns(table)).find(
      (tableColumn) => tableColumn.name === columnName,
    );

    expect(column).toBeDefined();
    return column as SqliteColumn;
  };

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
    });
    await dataSource.initialize();

    await dataSource.query(`
      CREATE TABLE "ledger_entry" (
        "entryId" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "assetId" varchar NOT NULL,
        "amount" varchar NOT NULL,
        "type" varchar NOT NULL,
        "refType" varchar,
        "refId" varchar,
        "idempotencyKey" varchar NOT NULL,
        "idempotencyContentHash" varchar NOT NULL,
        "reversalOf" varchar,
        "createdAt" varchar NOT NULL,
        CONSTRAINT "UQ_ledger_entry_idempotency_key" UNIQUE ("idempotencyKey")
      )
    `);
    await dataSource.query(`
      CREATE TABLE "market_making_order_balance" (
        "orderId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "assetId" varchar NOT NULL,
        "available" varchar NOT NULL DEFAULT ('0'),
        "locked" varchar NOT NULL DEFAULT ('0'),
        "total" varchar NOT NULL DEFAULT ('0'),
        "initialDeposit" varchar NOT NULL DEFAULT ('0'),
        "realizedDelta" varchar NOT NULL DEFAULT ('0'),
        "feePaid" varchar NOT NULL DEFAULT ('0'),
        "updatedAt" varchar NOT NULL,
        PRIMARY KEY ("orderId", "assetId")
      )
    `);
    await dataSource.query(`
      CREATE TABLE "tracked_order" (
        "trackingKey" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "strategyKey" varchar NOT NULL,
        "exchange" varchar NOT NULL,
        "accountLabel" varchar,
        "pair" varchar NOT NULL,
        "exchangeOrderId" varchar NOT NULL,
        "clientOrderId" varchar,
        "slotKey" varchar,
        "role" varchar,
        "side" varchar NOT NULL,
        "price" varchar NOT NULL,
        "qty" varchar NOT NULL,
        "cumulativeFilledQty" varchar,
        "settledFilledQty" varchar,
        "status" varchar NOT NULL,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL
      )
    `);
    await dataSource.query(`
      CREATE TABLE "exchange_order_mapping" (
        "id" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "exchangeOrderId" varchar,
        "clientOrderId" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await dataSource.query(
      `CREATE INDEX "IDX_648635a12ec8f4f524c203f0ab" ON "ledger_entry" ("orderId")`,
    );
    await dataSource.query(
      `CREATE INDEX "IDX_d90bdf76a4e458e2b0963a73b0" ON "ledger_entry" ("userId")`,
    );
    await dataSource.query(
      `CREATE INDEX "IDX_c016e418abaf6664d00dc190f7" ON "ledger_entry" ("assetId")`,
    );
    await dataSource.query(
      `CREATE INDEX "IDX_ea79c038e6ea5b5759839f369e" ON "market_making_order_balance" ("userId")`,
    );
    await dataSource.query(
      `CREATE INDEX "IDX_117b4b02ef4d18a96445c6f223" ON "tracked_order" ("trackingKey")`,
    );
    await dataSource.query(
      `CREATE INDEX "IDX_626e1085f4b77f5e5cfa4fdd96" ON "tracked_order" ("strategyKey")`,
    );
    await dataSource.query(
      `CREATE INDEX "IDX_exchange_order_mapping_order_id" ON "exchange_order_mapping" ("orderId")`,
    );
    await dataSource.query(
      `CREATE INDEX "IDX_exchange_order_mapping_exchange_order_id" ON "exchange_order_mapping" ("exchangeOrderId")`,
    );
    await dataSource.query(
      `CREATE UNIQUE INDEX "IDX_exchange_order_mapping_client_order_id" ON "exchange_order_mapping" ("clientOrderId")`,
    );

    await dataSource.query(`
      INSERT INTO "ledger_entry" (
        "entryId", "orderId", "userId", "assetId", "amount", "type",
        "refType", "refId", "idempotencyKey", "idempotencyContentHash",
        "reversalOf", "createdAt"
      ) VALUES
        (
          'entry-maker', 'order-1:maker', 'user-1', 'BTC', '1',
          'deposit_credit', NULL, NULL, 'idem-1', 'hash-1', NULL,
          '2026-06-01T00:00:00.000Z'
        ),
        (
          'entry-default', 'order-2', 'user-1', 'USDT', '2',
          'reserve_lock', NULL, NULL, 'idem-2', 'hash-2', NULL,
          '2026-06-01T00:00:00.000Z'
        )
    `);
    await dataSource.query(`
      INSERT INTO "market_making_order_balance" (
        "orderId", "userId", "assetId", "available", "locked", "total",
        "initialDeposit", "realizedDelta", "feePaid", "updatedAt"
      ) VALUES (
        'order-3:taker', 'user-2', 'USDT', '10', '1', '11',
        '10', '1', '0', '2026-06-01T00:00:00.000Z'
      )
    `);
    await dataSource.query(`
      INSERT INTO "tracked_order" (
        "trackingKey", "orderId", "strategyKey", "exchange", "accountLabel",
        "pair", "exchangeOrderId", "clientOrderId", "slotKey", "role",
        "side", "price", "qty", "cumulativeFilledQty", "settledFilledQty",
        "status", "createdAt", "updatedAt"
      ) VALUES
        (
          'tracking-1', 'order-4:maker', 'strategy-1', 'binance', NULL,
          'BTC/USDT', 'exchange-order-1', 'client-order-1', 'slot-1',
          'maker', 'buy', '100', '0.1', '0.01', '0.01', 'open',
          '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'
        ),
        (
          'tracking-2', 'order-5', 'strategy-1', 'binance', 'custom',
          'BTC/USDT', 'exchange-order-2', 'client-order-2', 'slot-2',
          'taker', 'sell', '110', '0.2', '0.02', '0.02', 'closed',
          '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'
        )
    `);
    await dataSource.query(`
      INSERT INTO "exchange_order_mapping" (
        "id", "orderId", "exchangeOrderId", "clientOrderId", "createdAt"
      ) VALUES (
        'mapping-1', 'order-6:taker', NULL, 'client-order-3',
        '2026-06-01 00:00:00'
      )
    `);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('backfills order identity fields and preserves existing rows', async () => {
    await runMigration('up');

    await expect(requireColumn('ledger_entry', 'userOrderId')).resolves.toEqual(
      expect.objectContaining({ notnull: 1 }),
    );
    await expect(
      requireColumn('ledger_entry', 'accountLabel'),
    ).resolves.toEqual(expect.objectContaining({ notnull: 1 }));
    await expect(
      requireColumn('market_making_order_balance', 'userOrderId'),
    ).resolves.toEqual(expect.objectContaining({ notnull: 1 }));
    await expect(
      requireColumn('market_making_order_balance', 'accountLabel'),
    ).resolves.toEqual(expect.objectContaining({ notnull: 1 }));
    await expect(
      requireColumn('tracked_order', 'userOrderId'),
    ).resolves.toEqual(expect.objectContaining({ notnull: 1 }));
    await expect(
      requireColumn('exchange_order_mapping', 'userOrderId'),
    ).resolves.toEqual(expect.objectContaining({ notnull: 1 }));
    await expect(
      requireColumn('exchange_order_mapping', 'accountLabel'),
    ).resolves.toEqual(expect.objectContaining({ notnull: 1 }));
    await expect(
      requireColumn('exchange_order_mapping', 'exchange'),
    ).resolves.toEqual(expect.objectContaining({ notnull: 1 }));

    const ledgerRows = await dataSource.query(`
      SELECT "entryId", "orderId", "userOrderId", "accountLabel", "amount"
      FROM "ledger_entry"
      ORDER BY "entryId"
    `);
    expect(ledgerRows).toEqual([
      {
        entryId: 'entry-default',
        orderId: 'order-2',
        userOrderId: 'order-2',
        accountLabel: 'default',
        amount: '2',
      },
      {
        entryId: 'entry-maker',
        orderId: 'order-1:maker',
        userOrderId: 'order-1',
        accountLabel: 'maker',
        amount: '1',
      },
    ]);

    const balanceRows = await dataSource.query(`
      SELECT "orderId", "userOrderId", "accountLabel", "assetId", "total"
      FROM "market_making_order_balance"
    `);
    expect(balanceRows).toEqual([
      {
        orderId: 'order-3:taker',
        userOrderId: 'order-3',
        accountLabel: 'taker',
        assetId: 'USDT',
        total: '11',
      },
    ]);

    const trackedRows = await dataSource.query(`
      SELECT "trackingKey", "userOrderId", "accountLabel", "settledFilledQty"
      FROM "tracked_order"
      ORDER BY "trackingKey"
    `);
    expect(trackedRows).toEqual([
      {
        trackingKey: 'tracking-1',
        userOrderId: 'order-4',
        accountLabel: 'maker',
        settledFilledQty: '0.01',
      },
      {
        trackingKey: 'tracking-2',
        userOrderId: 'order-5',
        accountLabel: 'custom',
        settledFilledQty: '0.02',
      },
    ]);

    const mappingRows = await dataSource.query(`
      SELECT "id", "userOrderId", "accountLabel", "exchange", "exchangeOrderId"
      FROM "exchange_order_mapping"
    `);
    expect(mappingRows).toEqual([
      {
        id: 'mapping-1',
        userOrderId: 'order-6',
        accountLabel: 'taker',
        exchange: '',
        exchangeOrderId: null,
      },
    ]);

    const newIndexes = await dataSource.query(`
      SELECT "name"
      FROM "sqlite_master"
      WHERE "type" = 'index'
        AND "name" IN (
          'IDX_ledger_entry_user_order_id',
          'IDX_market_making_order_balance_user_order_id',
          'IDX_tracked_order_user_order_id',
          'IDX_exchange_order_mapping_exchange'
        )
      ORDER BY "name"
    `);
    expect(newIndexes.map((row: { name: string }) => row.name)).toEqual([
      'IDX_exchange_order_mapping_exchange',
      'IDX_ledger_entry_user_order_id',
      'IDX_market_making_order_balance_user_order_id',
      'IDX_tracked_order_user_order_id',
    ]);
  });

  it('removes order identity fields on down without dropping existing rows', async () => {
    await runMigration('up');
    await runMigration('down');

    await expect(columnNames('ledger_entry')).resolves.not.toContain(
      'userOrderId',
    );
    await expect(columnNames('ledger_entry')).resolves.not.toContain(
      'accountLabel',
    );
    await expect(
      columnNames('market_making_order_balance'),
    ).resolves.not.toContain('userOrderId');
    await expect(
      columnNames('market_making_order_balance'),
    ).resolves.not.toContain('accountLabel');
    await expect(columnNames('tracked_order')).resolves.not.toContain(
      'userOrderId',
    );
    await expect(columnNames('exchange_order_mapping')).resolves.not.toContain(
      'userOrderId',
    );
    await expect(columnNames('exchange_order_mapping')).resolves.not.toContain(
      'accountLabel',
    );
    await expect(columnNames('exchange_order_mapping')).resolves.not.toContain(
      'exchange',
    );

    const ledgerCount = await dataSource.query(
      `SELECT COUNT(*) AS "count" FROM "ledger_entry"`,
    );
    const trackedCount = await dataSource.query(
      `SELECT COUNT(*) AS "count" FROM "tracked_order"`,
    );
    const mappingCount = await dataSource.query(
      `SELECT COUNT(*) AS "count" FROM "exchange_order_mapping"`,
    );

    expect(ledgerCount[0].count).toBe(2);
    expect(trackedCount[0].count).toBe(2);
    expect(mappingCount[0].count).toBe(1);
  });
});
