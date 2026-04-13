import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowPendingExchangeOrderMappings1776200000000
  implements MigrationInterface
{
  name = 'AllowPendingExchangeOrderMappings1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='exchange_order_mapping'`,
    );

    if (table.length === 0) {
      return;
    }

    await queryRunner.query(
      `DROP INDEX "IDX_exchange_order_mapping_client_order_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_exchange_order_mapping_exchange_order_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_exchange_order_mapping_order_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_exchange_order_mapping" (
        "id" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "exchangeOrderId" varchar,
        "clientOrderId" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_exchange_order_mapping"("id", "orderId", "exchangeOrderId", "clientOrderId", "createdAt")
       SELECT "id", "orderId", "exchangeOrderId", "clientOrderId", "createdAt"
       FROM "exchange_order_mapping"`,
    );
    await queryRunner.query(`DROP TABLE "exchange_order_mapping"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_exchange_order_mapping" RENAME TO "exchange_order_mapping"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_order_mapping_order_id" ON "exchange_order_mapping" ("orderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_order_mapping_exchange_order_id" ON "exchange_order_mapping" ("exchangeOrderId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_exchange_order_mapping_client_order_id" ON "exchange_order_mapping" ("clientOrderId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='exchange_order_mapping'`,
    );

    if (table.length === 0) {
      return;
    }

    await queryRunner.query(
      `DROP INDEX "IDX_exchange_order_mapping_client_order_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_exchange_order_mapping_exchange_order_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_exchange_order_mapping_order_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_exchange_order_mapping" (
        "id" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "exchangeOrderId" varchar NOT NULL,
        "clientOrderId" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_exchange_order_mapping"("id", "orderId", "exchangeOrderId", "clientOrderId", "createdAt")
       SELECT "id", "orderId", COALESCE("exchangeOrderId", ''), "clientOrderId", "createdAt"
       FROM "exchange_order_mapping"`,
    );
    await queryRunner.query(`DROP TABLE "exchange_order_mapping"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_exchange_order_mapping" RENAME TO "exchange_order_mapping"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_order_mapping_order_id" ON "exchange_order_mapping" ("orderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_order_mapping_exchange_order_id" ON "exchange_order_mapping" ("exchangeOrderId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_exchange_order_mapping_client_order_id" ON "exchange_order_mapping" ("clientOrderId")`,
    );
  }
}
