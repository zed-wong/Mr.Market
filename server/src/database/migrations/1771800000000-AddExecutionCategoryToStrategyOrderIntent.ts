import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExecutionCategoryToStrategyOrderIntent1771800000000
  implements MigrationInterface
{
  name = 'AddExecutionCategoryToStrategyOrderIntent1771800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "strategy_order_intent" ADD "executionCategory" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy_order_intent" ADD "metadata" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_strategy_order_intent" ("intentId" varchar PRIMARY KEY NOT NULL, "strategyInstanceId" varchar NOT NULL, "strategyKey" varchar NOT NULL, "userId" varchar NOT NULL, "clientId" varchar NOT NULL, "type" varchar NOT NULL, "exchange" varchar NOT NULL, "pair" varchar NOT NULL, "side" varchar NOT NULL, "price" varchar NOT NULL, "qty" varchar NOT NULL, "mixinOrderId" varchar, "status" varchar NOT NULL, "errorReason" varchar, "createdAt" varchar NOT NULL, "updatedAt" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_strategy_order_intent"("intentId", "strategyInstanceId", "strategyKey", "userId", "clientId", "type", "exchange", "pair", "side", "price", "qty", "mixinOrderId", "status", "errorReason", "createdAt", "updatedAt") SELECT "intentId", "strategyInstanceId", "strategyKey", "userId", "clientId", "type", "exchange", "pair", "side", "price", "qty", "mixinOrderId", "status", "errorReason", "createdAt", "updatedAt" FROM "strategy_order_intent"`,
    );
    await queryRunner.query(`DROP TABLE "strategy_order_intent"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_strategy_order_intent" RENAME TO "strategy_order_intent"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_order_intent_strategy_key" ON "strategy_order_intent" ("strategyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_order_intent_status" ON "strategy_order_intent" ("status")`,
    );
  }
}
