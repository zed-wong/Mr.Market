import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderScopedLedger1776400000000
  implements MigrationInterface
{
  name = 'AddOrderScopedLedger1776400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "balance_read_model"`);
    await queryRunner.query(
      `CREATE TABLE "market_making_order_balance" (
        "orderId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "assetId" varchar NOT NULL,
        "available" varchar NOT NULL DEFAULT ('0'),
        "locked" varchar NOT NULL DEFAULT ('0'),
        "total" varchar NOT NULL DEFAULT ('0'),
        "initialDeposit" varchar NOT NULL DEFAULT ('0'),
        "realizedDelta" varchar NOT NULL DEFAULT ('0'),
        "feePaid" varchar NOT NULL DEFAULT ('0'),
        "updatedAt" varchar NOT NULL,
        PRIMARY KEY ("orderId", "assetId")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_market_making_order_balance_user_id" ON "market_making_order_balance" ("userId")`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_entry"`);
    await queryRunner.query(
      `CREATE TABLE "ledger_entry" (
        "entryId" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "assetId" varchar NOT NULL,
        "amount" varchar NOT NULL,
        "type" varchar NOT NULL,
        "refType" varchar,
        "refId" varchar,
        "idempotencyKey" varchar NOT NULL,
        "idempotencyContentHash" varchar NOT NULL,
        "reversalOf" varchar,
        "createdAt" varchar NOT NULL,
        CONSTRAINT "UQ_ledger_entry_idempotency_key" UNIQUE ("idempotencyKey")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entry_order_id" ON "ledger_entry" ("orderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entry_user_id" ON "ledger_entry" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entry_asset_id" ON "ledger_entry" ("assetId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_ledger_entry_asset_id"`);
    await queryRunner.query(`DROP INDEX "IDX_ledger_entry_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_ledger_entry_order_id"`);
    await queryRunner.query(`DROP TABLE "ledger_entry"`);

    await queryRunner.query(
      `DROP INDEX "IDX_market_making_order_balance_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "market_making_order_balance"`);
    await queryRunner.query(
      `CREATE TABLE "balance_read_model" (
        "userId" varchar NOT NULL,
        "assetId" varchar NOT NULL,
        "available" varchar NOT NULL DEFAULT ('0'),
        "locked" varchar NOT NULL DEFAULT ('0'),
        "total" varchar NOT NULL DEFAULT ('0'),
        "updatedAt" varchar NOT NULL,
        PRIMARY KEY ("userId", "assetId")
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "ledger_entry" (
        "entryId" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "assetId" varchar NOT NULL,
        "amount" varchar NOT NULL,
        "type" varchar NOT NULL,
        "refType" varchar,
        "refId" varchar,
        "idempotencyKey" varchar NOT NULL,
        "createdAt" varchar NOT NULL,
        CONSTRAINT "UQ_ledger_entry_idempotency_key" UNIQUE ("idempotencyKey")
      )`,
    );
  }
}
