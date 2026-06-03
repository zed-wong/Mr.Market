import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrackedOrderSettledFilledQty1780000000000
  implements MigrationInterface
{
  name = 'AddTrackedOrderSettledFilledQty1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='tracked_order'`,
    );

    if (table.length === 0) {
      return;
    }

    const columns = await queryRunner.query(
      `PRAGMA table_info("tracked_order")`,
    );
    const hasColumn = columns.some(
      (column: { name?: string }) => column.name === 'settledFilledQty',
    );

    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE "tracked_order" ADD COLUMN "settledFilledQty" varchar`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='tracked_order'`,
    );

    if (table.length === 0) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE "temporary_tracked_order" (
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
        "status" varchar NOT NULL,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_tracked_order"(
        "trackingKey", "orderId", "strategyKey", "exchange", "accountLabel",
        "pair", "exchangeOrderId", "clientOrderId", "slotKey", "role",
        "side", "price", "qty", "cumulativeFilledQty", "status",
        "createdAt", "updatedAt"
      )
      SELECT
        "trackingKey", "orderId", "strategyKey", "exchange", "accountLabel",
        "pair", "exchangeOrderId", "clientOrderId", "slotKey", "role",
        "side", "price", "qty", "cumulativeFilledQty", "status",
        "createdAt", "updatedAt"
      FROM "tracked_order"`,
    );
    await queryRunner.query(`DROP TABLE "tracked_order"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_tracked_order" RENAME TO "tracked_order"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tracked_order_trackingKey" ON "tracked_order" ("trackingKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tracked_order_strategyKey" ON "tracked_order" ("strategyKey")`,
    );
  }
}
