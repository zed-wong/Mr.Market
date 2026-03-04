import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropLegacyStrategyHistoryTables1771500000000
  implements MigrationInterface
{
  name = 'DropLegacyStrategyHistoryTables1771500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.dropTableIfExists(queryRunner, 'market_making_history');
    await this.dropTableIfExists(queryRunner, 'arbitrage_history');
    await this.dropTableIfExists(queryRunner, 'indicator_strategy_history');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "market_making_history" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" varchar NOT NULL,
        "clientId" varchar,
        "exchange" varchar NOT NULL,
        "pair" varchar NOT NULL,
        "side" varchar NOT NULL,
        "amount" text,
        "price" text,
        "orderId" varchar NOT NULL,
        "executedAt" datetime,
        "status" varchar,
        "strategy" varchar,
        "strategyInstanceId" varchar
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "arbitrage_history" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" varchar NOT NULL,
        "clientId" varchar,
        "pair" varchar NOT NULL,
        "exchangeAName" varchar,
        "exchangeBName" varchar,
        "amount" text,
        "buyPrice" text,
        "sellPrice" text,
        "profit" integer,
        "executedAt" datetime,
        "status" varchar,
        "strategy" varchar
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "indicator_strategy_history" (
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
  }

  private async dropTableIfExists(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
    );

    if (rows.length) {
      await queryRunner.query(`DROP TABLE "${tableName}"`);
    }
  }
}
