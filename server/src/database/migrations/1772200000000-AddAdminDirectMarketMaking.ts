import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminDirectMarketMaking1772200000000
  implements MigrationInterface
{
  name = 'AddAdminDirectMarketMaking1772200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const mmOrderColumns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("market_making_order")`,
    );

    if (
      mmOrderColumns.length > 0 &&
      !mmOrderColumns.some((column) => column.name === 'source')
    ) {
      await queryRunner.query(
        `ALTER TABLE "market_making_order" ADD "source" varchar NOT NULL DEFAULT ('payment_flow')`,
      );
    }

    if (
      mmOrderColumns.length > 0 &&
      !mmOrderColumns.some((column) => column.name === 'apiKeyId')
    ) {
      await queryRunner.query(
        `ALTER TABLE "market_making_order" ADD "apiKeyId" varchar`,
      );
    }

    const campaignJoinExists: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_join'`,
    );

    if (campaignJoinExists.length === 0) {
      await queryRunner.query(
        `CREATE TABLE "campaign_join" (
          "id" varchar PRIMARY KEY NOT NULL,
          "evmAddress" varchar NOT NULL,
          "apiKeyId" varchar NOT NULL,
          "chainId" integer NOT NULL,
          "campaignAddress" varchar NOT NULL,
          "orderId" varchar,
          "status" varchar NOT NULL,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
          CONSTRAINT "UQ_campaign_join_binding" UNIQUE ("evmAddress", "apiKeyId", "campaignAddress", "chainId")
        )`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const campaignJoinExists: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_join'`,
    );

    if (campaignJoinExists.length > 0) {
      await queryRunner.query(`DROP TABLE "campaign_join"`);
    }

    const mmOrderColumns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("market_making_order")`,
    );

    const hasSource = mmOrderColumns.some((column) => column.name === 'source');
    const hasApiKeyId = mmOrderColumns.some(
      (column) => column.name === 'apiKeyId',
    );

    if (!hasSource && !hasApiKeyId) {
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
