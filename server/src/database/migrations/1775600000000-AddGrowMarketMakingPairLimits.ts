import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGrowMarketMakingPairLimits1775600000000
  implements MigrationInterface
{
  name = 'AddGrowMarketMakingPairLimits1775600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" ADD COLUMN "min_order_amount" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" ADD COLUMN "max_order_amount" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" ADD COLUMN "amount_significant_figures" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" ADD COLUMN "price_significant_figures" varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" DROP COLUMN "price_significant_figures"`,
    );
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" DROP COLUMN "amount_significant_figures"`,
    );
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" DROP COLUMN "max_order_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" DROP COLUMN "min_order_amount"`,
    );
  }
}
