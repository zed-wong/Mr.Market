import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStrategyOrderIntentTable1770900000000
  implements MigrationInterface
{
  name = 'AddStrategyOrderIntentTable1770900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "strategy_order_intent" ("intentId" varchar PRIMARY KEY NOT NULL, "strategyInstanceId" varchar NOT NULL, "strategyKey" varchar NOT NULL, "userId" varchar NOT NULL, "clientId" varchar NOT NULL, "type" varchar NOT NULL, "exchange" varchar NOT NULL, "pair" varchar NOT NULL, "side" varchar NOT NULL, "price" varchar NOT NULL, "qty" varchar NOT NULL, "mixinOrderId" varchar, "status" varchar NOT NULL, "errorReason" varchar, "createdAt" varchar NOT NULL, "updatedAt" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_order_intent_strategy_key" ON "strategy_order_intent" ("strategyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_order_intent_status" ON "strategy_order_intent" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_strategy_order_intent_status"`);
    await queryRunner.query(
      `DROP INDEX "IDX_strategy_order_intent_strategy_key"`,
    );
    await queryRunner.query(`DROP TABLE "strategy_order_intent"`);
  }
}
