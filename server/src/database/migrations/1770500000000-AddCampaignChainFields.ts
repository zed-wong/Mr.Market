import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCampaignChainFields1770500000000 implements MigrationInterface {
  name = 'AddCampaignChainFields1770500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "campaign" ADD COLUMN "chainId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaign" ADD COLUMN "address" varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "campaign" DROP COLUMN "address"`);
    await queryRunner.query(`ALTER TABLE "campaign" DROP COLUMN "chainId"`);
  }
}
