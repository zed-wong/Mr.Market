import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountAwareExecutionFields1775800000000
  implements MigrationInterface
{
  name = 'AddAccountAwareExecutionFields1775800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tracked_order" ADD "accountLabel" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "tracked_order" ADD "slotKey" varchar`,
    );
    await queryRunner.query(`ALTER TABLE "tracked_order" ADD "role" varchar`);
    await queryRunner.query(
      `UPDATE "tracked_order" SET "trackingKey" = "exchange" || ':' || COALESCE("accountLabel", 'default') || ':' || "exchangeOrderId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy_order_intent" ADD "accountLabel" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy_order_intent" ADD "postOnly" boolean`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy_order_intent" ADD "timeInForce" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy_order_intent" ADD "slotKey" varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_strategy_order_intent" ("intentId" varchar PRIMARY KEY NOT NULL, "strategyInstanceId" varchar NOT NULL, "strategyKey" varchar NOT NULL, "userId" varchar NOT NULL, "clientId" varchar NOT NULL, "type" varchar NOT NULL, "exchange" varchar NOT NULL, "pair" varchar NOT NULL, "side" varchar NOT NULL, "price" varchar NOT NULL, "qty" varchar NOT NULL, "mixinOrderId" varchar, "executionCategory" varchar, "metadata" text, "status" varchar NOT NULL, "errorReason" varchar, "createdAt" varchar NOT NULL, "updatedAt" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_strategy_order_intent"("intentId", "strategyInstanceId", "strategyKey", "userId", "clientId", "type", "exchange", "pair", "side", "price", "qty", "mixinOrderId", "executionCategory", "metadata", "status", "errorReason", "createdAt", "updatedAt") SELECT "intentId", "strategyInstanceId", "strategyKey", "userId", "clientId", "type", "exchange", "pair", "side", "price", "qty", "mixinOrderId", "executionCategory", "metadata", "status", "errorReason", "createdAt", "updatedAt" FROM "strategy_order_intent"`,
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
    await queryRunner.query(
      `CREATE TABLE "temporary_tracked_order" ("trackingKey" varchar PRIMARY KEY NOT NULL, "orderId" varchar NOT NULL, "strategyKey" varchar NOT NULL, "exchange" varchar NOT NULL, "pair" varchar NOT NULL, "exchangeOrderId" varchar NOT NULL, "clientOrderId" varchar, "side" varchar NOT NULL, "price" varchar NOT NULL, "qty" varchar NOT NULL, "cumulativeFilledQty" varchar, "status" varchar NOT NULL, "createdAt" varchar NOT NULL, "updatedAt" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_tracked_order"("trackingKey", "orderId", "strategyKey", "exchange", "pair", "exchangeOrderId", "clientOrderId", "side", "price", "qty", "cumulativeFilledQty", "status", "createdAt", "updatedAt") SELECT "trackingKey", "orderId", "strategyKey", "exchange", "pair", "exchangeOrderId", "clientOrderId", "side", "price", "qty", "cumulativeFilledQty", "status", "createdAt", "updatedAt" FROM "tracked_order"`,
    );
    await queryRunner.query(`DROP TABLE "tracked_order"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_tracked_order" RENAME TO "tracked_order"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tracked_order_trackingKey" ON "tracked_order" ("trackingKey") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tracked_order_strategyKey" ON "tracked_order" ("strategyKey") `,
    );
  }
}
