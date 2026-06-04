import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExchangeClientOrderMappingContext1780600000000
  implements MigrationInterface
{
  name = 'AddExchangeClientOrderMappingContext1780600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='exchange_order_mapping'`,
    );

    if (table.length === 0) {
      return;
    }

    const columns = await this.listColumns(queryRunner);

    if (!columns.has('exchangeName')) {
      await queryRunner.query(
        `ALTER TABLE "exchange_order_mapping" ADD COLUMN "exchangeName" varchar`,
      );
    }
    if (!columns.has('exchangeClientOrderId')) {
      await queryRunner.query(
        `ALTER TABLE "exchange_order_mapping" ADD COLUMN "exchangeClientOrderId" varchar`,
      );
    }

    const indexes = await this.listIndexes(queryRunner);

    if (!indexes.has('IDX_exchange_order_mapping_exchange_name')) {
      await queryRunner.query(
        `CREATE INDEX "IDX_exchange_order_mapping_exchange_name" ON "exchange_order_mapping" ("exchangeName")`,
      );
    }
    if (!indexes.has('IDX_exchange_order_mapping_exchange_client_order_id')) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX "IDX_exchange_order_mapping_exchange_client_order_id" ON "exchange_order_mapping" ("exchangeClientOrderId")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='exchange_order_mapping'`,
    );

    if (table.length === 0) {
      return;
    }

    const indexes = await this.listIndexes(queryRunner);

    if (indexes.has('IDX_exchange_order_mapping_exchange_client_order_id')) {
      await queryRunner.query(
        `DROP INDEX "IDX_exchange_order_mapping_exchange_client_order_id"`,
      );
    }
    if (indexes.has('IDX_exchange_order_mapping_exchange_name')) {
      await queryRunner.query(
        `DROP INDEX "IDX_exchange_order_mapping_exchange_name"`,
      );
    }

    const columns = await this.listColumns(queryRunner);

    if (
      !columns.has('exchangeName') &&
      !columns.has('exchangeClientOrderId')
    ) {
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

  private async listColumns(queryRunner: QueryRunner): Promise<Set<string>> {
    const columns = (await queryRunner.query(
      `PRAGMA table_info("exchange_order_mapping")`,
    )) as Array<{ name: string }>;

    return new Set(columns.map((column) => column.name));
  }

  private async listIndexes(queryRunner: QueryRunner): Promise<Set<string>> {
    const indexes = (await queryRunner.query(
      `PRAGMA index_list("exchange_order_mapping")`,
    )) as Array<{ name: string }>;

    return new Set(indexes.map((index) => index.name));
  }
}
