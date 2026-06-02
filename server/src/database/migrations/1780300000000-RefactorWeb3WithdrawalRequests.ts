import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorWeb3WithdrawalRequests1780300000000
  implements MigrationInterface
{
  name = 'RefactorWeb3WithdrawalRequests1780300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "orderId" varchar NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "routerAddress" varchar NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "feeTokenAddress" varchar NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "feeAssetId" varchar NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "feeAmount" varchar NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "requestSecret" varchar NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "feeDebitIdempotencyKey" varchar NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "feeLedgerEntryId" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "requestTxHash" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "requestLogIndex" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "startBlockNumber" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "payoutTxHash" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "externalPayoutId" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "expiresAt" varchar NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "expiresAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "externalPayoutId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "payoutTxHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "startBlockNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "requestLogIndex"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "requestTxHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "feeLedgerEntryId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "feeDebitIdempotencyKey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "requestSecret"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "feeAmount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "feeAssetId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "feeTokenAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "routerAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "orderId"`,
    );
  }
}
