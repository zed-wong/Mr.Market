import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEvmExecutions1781400000000 implements MigrationInterface {
  name = 'AddEvmExecutions1781400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm_executions" (
        "id" varchar PRIMARY KEY NOT NULL,
        "parentExecutionId" varchar,
        "executionType" varchar NOT NULL,
        "userOrderId" varchar NOT NULL,
        "ledgerOrderId" varchar NOT NULL,
        "accountLabel" varchar NOT NULL DEFAULT ('default'),
        "intentId" varchar NOT NULL,
        "connectorId" varchar NOT NULL,
        "exchangeType" varchar NOT NULL,
        "chainId" integer NOT NULL,
        "tradingAccountId" varchar NOT NULL,
        "nonce" integer NOT NULL,
        "txHash" varchar,
        "status" varchar NOT NULL,
        "submittedAt" varchar,
        "confirmedAt" varchar,
        "blockNumber" integer,
        "firstPendingBlockNumber" integer,
        "lastCheckedBlockNumber" integer,
        "confirmationCount" integer,
        "requiredConfirmations" integer NOT NULL,
        "receiptContentHash" varchar,
        "decodedEvents" text,
        "gasUsed" varchar,
        "gasPrice" varchar,
        "effectiveGasCost" varchar,
        "gasSponsorLedgerOrderId" varchar,
        "manualReviewReason" varchar,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL,
        CONSTRAINT "UQ_evm_execution_account_chain_nonce" UNIQUE ("tradingAccountId", "chainId", "nonce")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evm_execution_parent" ON "evm_executions" ("parentExecutionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evm_execution_user_order" ON "evm_executions" ("userOrderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evm_execution_ledger_order" ON "evm_executions" ("ledgerOrderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evm_execution_intent" ON "evm_executions" ("intentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evm_execution_chain" ON "evm_executions" ("chainId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evm_execution_account" ON "evm_executions" ("tradingAccountId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evm_execution_hash" ON "evm_executions" ("txHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evm_execution_status" ON "evm_executions" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_evm_execution_status"`);
    await queryRunner.query(`DROP INDEX "IDX_evm_execution_hash"`);
    await queryRunner.query(`DROP INDEX "IDX_evm_execution_account"`);
    await queryRunner.query(`DROP INDEX "IDX_evm_execution_chain"`);
    await queryRunner.query(`DROP INDEX "IDX_evm_execution_intent"`);
    await queryRunner.query(`DROP INDEX "IDX_evm_execution_ledger_order"`);
    await queryRunner.query(`DROP INDEX "IDX_evm_execution_user_order"`);
    await queryRunner.query(`DROP INDEX "IDX_evm_execution_parent"`);
    await queryRunner.query(`DROP TABLE "evm_executions"`);
  }
}
