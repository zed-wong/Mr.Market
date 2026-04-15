import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreCampaignJoinTable1776100000000
  implements MigrationInterface
{
  name = 'RestoreCampaignJoinTable1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const campaignJoinExists: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_join'`,
    );

    if (campaignJoinExists.length > 0) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE "campaign_join" (
        "id" varchar PRIMARY KEY NOT NULL,
        "evmAddress" varchar NOT NULL,
        "apiKeyId" varchar NOT NULL,
        "chainId" integer NOT NULL,
        "campaignAddress" varchar NOT NULL,
        "orderId" varchar,
        "status" varchar NOT NULL,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL,
        CONSTRAINT "UQ_campaign_join_binding" UNIQUE ("evmAddress", "apiKeyId", "campaignAddress", "chainId")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const campaignJoinExists: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_join'`,
    );

    if (campaignJoinExists.length === 0) {
      return;
    }

    await queryRunner.query(`DROP TABLE "campaign_join"`);
  }
}
