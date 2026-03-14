import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStrategySnapshotToMarketMakingOrders1771900000000
  implements MigrationInterface
{
  name = 'AddStrategySnapshotToMarketMakingOrders1771900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const mmIntentColumns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("market_making_order_intent")`,
    );
    const mmOrderColumns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("market_making_order")`,
    );

    if (
      mmIntentColumns.length > 0 &&
      !mmIntentColumns.some((column) => column.name === 'configOverrides')
    ) {
      await queryRunner.query(
        `ALTER TABLE "market_making_order_intent" ADD "configOverrides" text`,
      );
    }

    if (
      mmOrderColumns.length > 0 &&
      !mmOrderColumns.some((column) => column.name === 'strategySnapshot')
    ) {
      await queryRunner.query(
        `ALTER TABLE "market_making_order" ADD "strategySnapshot" text`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const mmIntentColumns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("market_making_order_intent")`,
    );
    const mmOrderColumns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("market_making_order")`,
    );

    const hasIntentOverrides = mmIntentColumns.some(
      (column) => column.name === 'configOverrides',
    );
    const hasOrderSnapshot = mmOrderColumns.some(
      (column) => column.name === 'strategySnapshot',
    );

    if (hasIntentOverrides) {
      await queryRunner.query(
        `CREATE TABLE "temporary_market_making_order_intent" (
          "orderId" varchar PRIMARY KEY NOT NULL,
          "userId" varchar,
          "marketMakingPairId" varchar NOT NULL,
          "strategyDefinitionId" varchar,
          "state" varchar NOT NULL DEFAULT ('pending'),
          "createdAt" varchar NOT NULL,
          "updatedAt" varchar NOT NULL,
          "expiresAt" varchar NOT NULL
        )`,
      );
      await queryRunner.query(
        `INSERT INTO "temporary_market_making_order_intent" (
          "orderId",
          "userId",
          "marketMakingPairId",
          "strategyDefinitionId",
          "state",
          "createdAt",
          "updatedAt",
          "expiresAt"
        )
        SELECT
          "orderId",
          "userId",
          "marketMakingPairId",
          "strategyDefinitionId",
          "state",
          "createdAt",
          "updatedAt",
          "expiresAt"
        FROM "market_making_order_intent"`,
      );
      await queryRunner.query(`DROP TABLE "market_making_order_intent"`);
      await queryRunner.query(
        `ALTER TABLE "temporary_market_making_order_intent" RENAME TO "market_making_order_intent"`,
      );
    }

    if (hasOrderSnapshot) {
      await queryRunner.query(
        `CREATE TABLE "temporary_market_making_order" (
          "orderId" varchar PRIMARY KEY NOT NULL,
          "userId" varchar NOT NULL,
          "pair" varchar NOT NULL,
          "exchangeName" varchar NOT NULL,
          "strategyDefinitionId" varchar,
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
}
