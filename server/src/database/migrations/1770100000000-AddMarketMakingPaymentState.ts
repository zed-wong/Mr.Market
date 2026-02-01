import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketMakingPaymentState1770100000000
  implements MigrationInterface
{
  name = 'AddMarketMakingPaymentState1770100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "market_making_payment_state" (
        "orderId" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "type" varchar NOT NULL,
        "state" varchar,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL,
        "symbol" varchar NOT NULL,
        "baseAssetId" varchar NOT NULL,
        "baseAssetAmount" varchar NOT NULL DEFAULT ('0'),
        "baseAssetSnapshotId" varchar,
        "quoteAssetId" varchar NOT NULL,
        "quoteAssetAmount" varchar NOT NULL DEFAULT ('0'),
        "quoteAssetSnapshotId" varchar,
        "baseFeeAssetId" varchar,
        "baseFeeAssetAmount" varchar NOT NULL DEFAULT ('0'),
        "baseFeeAssetSnapshotId" varchar,
        "quoteFeeAssetId" varchar,
        "quoteFeeAssetAmount" varchar NOT NULL DEFAULT ('0'),
        "quoteFeeAssetSnapshotId" varchar,
        "requiredBaseWithdrawalFee" varchar,
        "requiredQuoteWithdrawalFee" varchar,
        "baseStrategyFeeAssetId" varchar,
        "baseStrategyFeeAmount" varchar NOT NULL DEFAULT ('0'),
        "baseStrategyFeeSnapshotId" varchar,
        "quoteStrategyFeeAssetId" varchar,
        "quoteStrategyFeeAmount" varchar NOT NULL DEFAULT ('0'),
        "quoteStrategyFeeSnapshotId" varchar,
        "requiredStrategyFeePercentage" varchar
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "market_making_payment_state"`);
  }
}
