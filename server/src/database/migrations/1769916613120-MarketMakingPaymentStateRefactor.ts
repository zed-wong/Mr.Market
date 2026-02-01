import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketMakingPaymentStateRefactor1769916613120
  implements MigrationInterface
{
  name = 'MarketMakingPaymentStateRefactor1769916613120';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns for strategy fee tracking (Category 3) - base and quote
    await queryRunner.query(`
      ALTER TABLE "payment_state" ADD COLUMN "baseStrategyFeeAssetId" varchar
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_state" ADD COLUMN "baseStrategyFeeAmount" varchar DEFAULT '0'
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_state" ADD COLUMN "baseStrategyFeeSnapshotId" varchar
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_state" ADD COLUMN "quoteStrategyFeeAssetId" varchar
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_state" ADD COLUMN "quoteStrategyFeeAmount" varchar DEFAULT '0'
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_state" ADD COLUMN "quoteStrategyFeeSnapshotId" varchar
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_state" ADD COLUMN "requiredStrategyFeePercentage" varchar
    `);

    // Migrate data from old column to new column
    await queryRunner.query(`
      UPDATE "payment_state"
      SET "requiredStrategyFeePercentage" = "requiredMarketMakingFee"
      WHERE "requiredMarketMakingFee" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_state" DROP COLUMN "requiredStrategyFeePercentage"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_state" DROP COLUMN "quoteStrategyFeeSnapshotId"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_state" DROP COLUMN "quoteStrategyFeeAmount"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_state" DROP COLUMN "quoteStrategyFeeAssetId"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_state" DROP COLUMN "baseStrategyFeeSnapshotId"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_state" DROP COLUMN "baseStrategyFeeAmount"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_state" DROP COLUMN "baseStrategyFeeAssetId"
    `);
  }
}
