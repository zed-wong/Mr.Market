import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeb3Withdrawal1780100000000 implements MigrationInterface {
  name = 'AddWeb3Withdrawal1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "web3_withdrawal" (
        "withdrawalId" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "chainId" integer NOT NULL,
        "tokenAddress" varchar NOT NULL,
        "assetId" varchar NOT NULL,
        "amount" varchar NOT NULL,
        "recipientAddress" varchar NOT NULL,
        "status" varchar NOT NULL,
        "idempotencyKey" varchar NOT NULL,
        "payloadHash" varchar NOT NULL,
        "ledgerDebitIdempotencyKey" varchar NOT NULL,
        "ledgerEntryId" varchar,
        "txHash" varchar,
        "failureReason" varchar,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_web3_withdrawal_idempotency_key" ON "web3_withdrawal" ("idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_web3_withdrawal_user_id" ON "web3_withdrawal" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_web3_withdrawal_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_web3_withdrawal_idempotency_key"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "web3_withdrawal"`);
  }
}
