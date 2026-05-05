import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRewardOrderAttribution1776700000000
  implements MigrationInterface
{
  name = 'AddRewardOrderAttribution1776700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const allocationColumns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("reward_allocation")`,
    );

    if (!allocationColumns.some((column) => column.name === 'orderId')) {
      await queryRunner.query(
        `ALTER TABLE "reward_allocation" ADD "orderId" varchar NOT NULL DEFAULT ('')`,
      );
    }

    const ledgerColumns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("reward_ledger")`,
    );

    if (!ledgerColumns.some((column) => column.name === 'correctionOf')) {
      await queryRunner.query(
        `ALTER TABLE "reward_ledger" ADD "correctionOf" varchar`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const allocationColumns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("reward_allocation")`,
    );
    const ledgerColumns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("reward_ledger")`,
    );

    if (allocationColumns.some((column) => column.name === 'orderId')) {
      await queryRunner.query(
        `CREATE TABLE "temporary_reward_allocation" (
          "allocationId" varchar PRIMARY KEY NOT NULL,
          "rewardTxHash" varchar NOT NULL,
          "campaignId" varchar NOT NULL,
          "dayIndex" integer NOT NULL,
          "userId" varchar NOT NULL,
          "token" varchar NOT NULL,
          "amount" varchar NOT NULL,
          "basisShares" varchar NOT NULL,
          "status" varchar NOT NULL DEFAULT ('CREATED'),
          "createdAt" varchar NOT NULL
        )`,
      );
      await queryRunner.query(
        `INSERT INTO "temporary_reward_allocation" (
          "allocationId",
          "rewardTxHash",
          "campaignId",
          "dayIndex",
          "userId",
          "token",
          "amount",
          "basisShares",
          "status",
          "createdAt"
        )
        SELECT
          "allocationId",
          "rewardTxHash",
          "campaignId",
          "dayIndex",
          "userId",
          "token",
          "amount",
          "basisShares",
          "status",
          "createdAt"
        FROM "reward_allocation"`,
      );
      await queryRunner.query(`DROP TABLE "reward_allocation"`);
      await queryRunner.query(
        `ALTER TABLE "temporary_reward_allocation" RENAME TO "reward_allocation"`,
      );
    }

    if (ledgerColumns.some((column) => column.name === 'correctionOf')) {
      await queryRunner.query(
        `CREATE TABLE "temporary_reward_ledger" (
          "txHash" varchar PRIMARY KEY NOT NULL,
          "token" varchar NOT NULL,
          "amount" varchar NOT NULL,
          "platformFee" varchar NOT NULL DEFAULT ('0'),
          "undistributedRemainder" varchar NOT NULL DEFAULT ('0'),
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
          "platformFee",
          "undistributedRemainder",
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
          "platformFee",
          "undistributedRemainder",
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
}
