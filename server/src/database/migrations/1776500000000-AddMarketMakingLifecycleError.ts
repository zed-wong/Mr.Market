import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketMakingLifecycleError1776500000000
  implements MigrationInterface
{
  name = 'AddMarketMakingLifecycleError1776500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("market_making_order")`,
    );

    if (columns.some((column) => column.name === 'lifecycleError')) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "market_making_order" ADD "lifecycleError" varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("market_making_order")`,
    );

    if (!columns.some((column) => column.name === 'lifecycleError')) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE "temporary_market_making_order" (
        "orderId" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "pair" varchar NOT NULL,
        "exchangeName" varchar NOT NULL,
        "strategyDefinitionId" varchar,
        "strategySnapshot" text,
        "source" varchar NOT NULL DEFAULT ('payment_flow'),
        "apiKeyId" varchar,
        "bidSpread" varchar NOT NULL,
        "askSpread" varchar NOT NULL,
        "orderAmount" varchar NOT NULL,
        "orderRefreshTime" varchar NOT NULL,
        "numberOfLayers" varchar NOT NULL,
        "priceSourceType" varchar NOT NULL,
        "amountChangePerLayer" varchar NOT NULL,
        "amountChangeType" varchar NOT NULL,
        "ceilingPrice" varchar NOT NULL,
        "floorPrice" varchar NOT NULL,
        "balanceA" varchar,
        "balanceB" varchar,
        "state" varchar NOT NULL,
        "createdAt" varchar NOT NULL,
        "rewardAddress" varchar
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_market_making_order" (
        "orderId",
        "userId",
        "pair",
        "exchangeName",
        "strategyDefinitionId",
        "strategySnapshot",
        "source",
        "apiKeyId",
        "bidSpread",
        "askSpread",
        "orderAmount",
        "orderRefreshTime",
        "numberOfLayers",
        "priceSourceType",
        "amountChangePerLayer",
        "amountChangeType",
        "ceilingPrice",
        "floorPrice",
        "balanceA",
        "balanceB",
        "state",
        "createdAt",
        "rewardAddress"
      )
      SELECT
        "orderId",
        "userId",
        "pair",
        "exchangeName",
        "strategyDefinitionId",
        "strategySnapshot",
        "source",
        "apiKeyId",
        "bidSpread",
        "askSpread",
        "orderAmount",
        "orderRefreshTime",
        "numberOfLayers",
        "priceSourceType",
        "amountChangePerLayer",
        "amountChangeType",
        "ceilingPrice",
        "floorPrice",
        "balanceA",
        "balanceB",
        "state",
        "createdAt",
        "rewardAddress"
      FROM "market_making_order"`,
    );
    await queryRunner.query(`DROP TABLE "market_making_order"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_market_making_order" RENAME TO "market_making_order"`,
    );
  }
}
