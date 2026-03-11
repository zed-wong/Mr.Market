import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExchangeOrderMapping1772000000000
  implements MigrationInterface
{
  name = 'AddExchangeOrderMapping1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='exchange_order_mapping'`,
    );

    if (table.length > 0) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE "exchange_order_mapping" (
        "id" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "exchangeOrderId" varchar NOT NULL,
        "clientOrderId" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
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
    await queryRunner.query(`DROP TABLE "exchange_order_mapping"`);
  }
}
