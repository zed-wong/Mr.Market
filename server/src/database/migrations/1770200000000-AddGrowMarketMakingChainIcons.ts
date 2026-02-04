import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGrowMarketMakingChainIcons1770200000000
  implements MigrationInterface
{
  name = 'AddGrowMarketMakingChainIcons1770200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" ADD COLUMN "base_chain_id" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" ADD COLUMN "base_chain_icon_url" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" ADD COLUMN "quote_chain_id" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" ADD COLUMN "quote_chain_icon_url" varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" DROP COLUMN "quote_chain_icon_url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" DROP COLUMN "quote_chain_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" DROP COLUMN "base_chain_icon_url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "growdata_market_making_pairs" DROP COLUMN "base_chain_id"`,
    );
  }
}
