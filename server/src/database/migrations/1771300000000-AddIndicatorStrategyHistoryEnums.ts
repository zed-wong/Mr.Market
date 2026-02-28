import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndicatorStrategyHistoryEnums1771300000000
  implements MigrationInterface
{
  name = 'AddIndicatorStrategyHistoryEnums1771300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='indicator_strategy_history'`,
    );

    if (!table.length) {
      // Keep strategy as varchar so future strategy values don't require a schema change.
      await queryRunner.query(
        `CREATE TABLE "indicator_strategy_history" (
          "id" varchar PRIMARY KEY NOT NULL,
          "userId" varchar NOT NULL,
          "clientId" varchar NOT NULL,
          "exchange" varchar NOT NULL,
          "symbol" varchar NOT NULL,
          "price" float NOT NULL,
          "amount" float NOT NULL,
          "side" varchar CHECK("side" IN ('buy','sell')) NOT NULL,
          "strategy" varchar NOT NULL DEFAULT ('timeIndicator'),
          "orderId" varchar,
          "executedAt" datetime NOT NULL DEFAULT (datetime('now'))
        )`,
      );

      return;
    }

    const invalidRows = (await queryRunner.query(
      `SELECT "id"
       FROM "indicator_strategy_history"
       WHERE NOT (LOWER("side") IN ('buy','sell'))`,
    )) as Array<{ id: string }>;

    if (invalidRows.length > 0) {
      const sampleIds = invalidRows
        .slice(0, 10)
        .map((row) => row.id)
        .join(', ');

      throw new Error(
        `Migration blocked: indicator_strategy_history contains ${invalidRows.length} rows with invalid side values. Sample ids: ${sampleIds}`,
      );
    }

    await queryRunner.startTransaction();
    try {
      // Keep strategy as varchar so future strategy values don't require a schema change.
      await queryRunner.query(
        `CREATE TABLE "indicator_strategy_history_tmp" (
          "id" varchar PRIMARY KEY NOT NULL,
          "userId" varchar NOT NULL,
          "clientId" varchar NOT NULL,
          "exchange" varchar NOT NULL,
          "symbol" varchar NOT NULL,
          "price" float NOT NULL,
          "amount" float NOT NULL,
          "side" varchar CHECK("side" IN ('buy','sell')) NOT NULL,
          "strategy" varchar NOT NULL DEFAULT ('timeIndicator'),
          "orderId" varchar,
          "executedAt" datetime NOT NULL DEFAULT (datetime('now'))
        )`,
      );
      await queryRunner.query(
        `INSERT INTO "indicator_strategy_history_tmp"
         ("id","userId","clientId","exchange","symbol","price","amount","side","strategy","orderId","executedAt")
         SELECT "id","userId","clientId","exchange","symbol","price","amount",LOWER("side"),"strategy","orderId","executedAt"
         FROM "indicator_strategy_history"`,
      );
      await queryRunner.query(`DROP TABLE "indicator_strategy_history"`);
      await queryRunner.query(
        `ALTER TABLE "indicator_strategy_history_tmp" RENAME TO "indicator_strategy_history"`,
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='indicator_strategy_history'`,
    );

    if (!table.length) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE "indicator_strategy_history_tmp" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "clientId" varchar NOT NULL,
        "exchange" varchar NOT NULL,
        "symbol" varchar NOT NULL,
        "price" float NOT NULL,
        "amount" float NOT NULL,
        "side" varchar NOT NULL,
        "strategy" varchar NOT NULL DEFAULT ('timeIndicator'),
        "orderId" varchar,
        "executedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "indicator_strategy_history_tmp"
       ("id","userId","clientId","exchange","symbol","price","amount","side","strategy","orderId","executedAt")
       SELECT "id","userId","clientId","exchange","symbol","price","amount","side","strategy","orderId","executedAt"
       FROM "indicator_strategy_history"`,
    );
    await queryRunner.query(`DROP TABLE "indicator_strategy_history"`);
    await queryRunner.query(
      `ALTER TABLE "indicator_strategy_history_tmp" RENAME TO "indicator_strategy_history"`,
    );
  }
}
