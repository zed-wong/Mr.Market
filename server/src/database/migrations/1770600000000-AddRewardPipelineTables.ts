import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRewardPipelineTables1770600000000
  implements MigrationInterface
{
  name = 'AddRewardPipelineTables1770600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "reward_ledger" ("txHash" varchar PRIMARY KEY NOT NULL, "token" varchar NOT NULL, "amount" varchar NOT NULL, "campaignId" varchar NOT NULL, "dayIndex" integer NOT NULL, "status" varchar NOT NULL, "observedAt" varchar NOT NULL, "confirmedAt" varchar, "distributedAt" varchar)`,
    );

    await queryRunner.query(
      `CREATE TABLE "reward_allocation" ("allocationId" varchar PRIMARY KEY NOT NULL, "rewardTxHash" varchar NOT NULL, "campaignId" varchar NOT NULL, "dayIndex" integer NOT NULL, "userId" varchar NOT NULL, "token" varchar NOT NULL, "amount" varchar NOT NULL, "basisShares" varchar NOT NULL, "status" varchar NOT NULL DEFAULT ('CREATED'), "createdAt" varchar NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reward_allocation"`);
    await queryRunner.query(`DROP TABLE "reward_ledger"`);
  }
}
