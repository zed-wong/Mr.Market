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
          "strategy" varchar CHECK("strategy" IN ('timeIndicator')) NOT NULL DEFAULT ('timeIndicator'),
          "orderId" varchar,
          "executedAt" datetime NOT NULL DEFAULT (datetime('now'))
        )`,
      );

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
        "side" varchar CHECK("side" IN ('buy','sell')) NOT NULL,
        "strategy" varchar CHECK("strategy" IN ('timeIndicator')) NOT NULL DEFAULT ('timeIndicator'),
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
