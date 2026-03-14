import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStrategyInstanceMarketMakingOrderBinding1771600000000
  implements MigrationInterface
{
  name = 'AddStrategyInstanceMarketMakingOrderBinding1771600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_instances'`,
    );

    if (!tableExists?.length) {
      return;
    }

    const columns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("strategy_instances")`,
    );
    const hasMarketMakingOrderId = columns.some(
      (column) => column.name === 'marketMakingOrderId',
    );

    if (!hasMarketMakingOrderId) {
      await queryRunner.query(
        `ALTER TABLE "strategy_instances" ADD "marketMakingOrderId" varchar`,
      );
    }

    await queryRunner.query(
      `UPDATE "strategy_instances"
       SET "marketMakingOrderId" = "clientId"
       WHERE "strategyType" = 'pureMarketMaking'
         AND ("marketMakingOrderId" IS NULL OR "marketMakingOrderId" = '')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_instances'`,
    );

    if (!tableExists?.length) {
      return;
    }

    const columns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("strategy_instances")`,
    );
    const hasMarketMakingOrderId = columns.some(
      (column) => column.name === 'marketMakingOrderId',
    );

    if (!hasMarketMakingOrderId) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE "temporary_strategy_instances" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "strategyKey" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "clientId" varchar NOT NULL,
        "strategyType" varchar NOT NULL,
        "definitionId" varchar,
        "definitionVersion" varchar DEFAULT ('1.0.0'),
        "startPrice" integer NOT NULL,
        "parameters" json NOT NULL,
        "status" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_strategy_instances" (
        "id",
        "strategyKey",
        "userId",
        "clientId",
        "strategyType",
        "definitionId",
        "definitionVersion",
        "startPrice",
        "parameters",
        "status",
        "createdAt",
        "updatedAt"
      )
      SELECT
        "id",
        "strategyKey",
        "userId",
        "clientId",
        "strategyType",
        "definitionId",
        "definitionVersion",
        "startPrice",
        "parameters",
        "status",
        "createdAt",
        "updatedAt"
      FROM "strategy_instances"`,
    );
    await queryRunner.query(`DROP TABLE "strategy_instances"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_strategy_instances" RENAME TO "strategy_instances"`,
    );
  }
}
