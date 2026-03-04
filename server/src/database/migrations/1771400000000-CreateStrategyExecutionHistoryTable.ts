import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStrategyExecutionHistoryTable1771400000000
  implements MigrationInterface
{
  name = 'CreateStrategyExecutionHistoryTable1771400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "strategy_execution_history" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "clientId" varchar, "exchange" varchar NOT NULL, "pair" varchar NOT NULL, "side" varchar CHECK( "side" IN ('buy','sell') ), "amount" text, "price" text, "strategyType" varchar NOT NULL, "strategyInstanceId" varchar, "orderId" varchar, "status" varchar, "metadata" text, "executedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_execution_history_user" ON "strategy_execution_history" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_execution_history_executed_at" ON "strategy_execution_history" ("executedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_execution_history_type" ON "strategy_execution_history" ("strategyType")`,
    );

    await queryRunner.query(
      `INSERT INTO "strategy_execution_history" ("id", "userId", "clientId", "exchange", "pair", "side", "amount", "price", "strategyType", "strategyInstanceId", "orderId", "status", "executedAt")
       SELECT lower(hex(randomblob(16))), "userId", "clientId", "exchange", "pair", CASE WHEN "side" IN ('buy', 'sell') THEN "side" ELSE NULL END, "amount", "price", COALESCE("strategy", 'market-making'), "strategyInstanceId", "orderId", "status", "executedAt"
       FROM "market_making_history"`,
    );

    await queryRunner.query(
      `INSERT INTO "strategy_execution_history" ("id", "userId", "clientId", "exchange", "pair", "side", "amount", "price", "strategyType", "orderId", "status", "metadata", "executedAt")
       SELECT lower(hex(randomblob(16))), "userId", "clientId", COALESCE("exchangeAName", ''), "pair", 'buy', "amount", "buyPrice", 'arbitrage', NULL, "status", NULL, "executedAt"
       FROM "arbitrage_history"`,
    );

    await queryRunner.query(
      `INSERT INTO "strategy_execution_history" ("id", "userId", "clientId", "exchange", "pair", "side", "amount", "price", "strategyType", "orderId", "executedAt")
       SELECT "id", "userId", "clientId", "exchange", "symbol", "side", CAST("amount" AS text), CAST("price" AS text), "strategy", "orderId", "executedAt"
       FROM "indicator_strategy_history"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_strategy_execution_history_type"`);
    await queryRunner.query(
      `DROP INDEX "IDX_strategy_execution_history_executed_at"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_strategy_execution_history_user"`);
    await queryRunner.query(`DROP TABLE "strategy_execution_history"`);
  }
}
