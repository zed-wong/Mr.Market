import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRewardLedgerRemainders1776600000000
  implements MigrationInterface
{
  name = 'AddRewardLedgerRemainders1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("reward_ledger")`,
    );

    if (!columns.some((column) => column.name === 'platformFee')) {
      await queryRunner.query(
        `ALTER TABLE "reward_ledger" ADD "platformFee" varchar NOT NULL DEFAULT ('0')`,
      );
    }

    if (!columns.some((column) => column.name === 'undistributedRemainder')) {
      await queryRunner.query(
        `ALTER TABLE "reward_ledger" ADD "undistributedRemainder" varchar NOT NULL DEFAULT ('0')`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("reward_ledger")`,
    );

    if (
      !columns.some((column) => column.name === 'platformFee') &&
      !columns.some((column) => column.name === 'undistributedRemainder')
    ) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE "temporary_reward_ledger" (
        "txHash" varchar PRIMARY KEY NOT NULL,
        "token" varchar NOT NULL,
        "amount" varchar NOT NULL,
        "campaignId" varchar NOT NULL,
        "dayIndex" integer NOT NULL,
        "status" varchar NOT NULL,
        "observedAt" varchar NOT NULL,
        "confirmedAt" varchar,
        "distributedAt" varchar
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_reward_ledger" (
        "txHash",
        "token",
        "amount",
        "campaignId",
        "dayIndex",
        "status",
        "observedAt",
        "confirmedAt",
        "distributedAt"
      )
      SELECT
        "txHash",
        "token",
        "amount",
        "campaignId",
        "dayIndex",
        "status",
        "observedAt",
        "confirmedAt",
        "distributedAt"
      FROM "reward_ledger"`,
    );
    await queryRunner.query(`DROP TABLE "reward_ledger"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_reward_ledger" RENAME TO "reward_ledger"`,
    );
  }
}
