import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBalanceLedger1770300000000 implements MigrationInterface {
  name = 'AddBalanceLedger1770300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ledger_entry" ("entryId" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "assetId" varchar NOT NULL, "amount" varchar NOT NULL, "type" varchar NOT NULL, "refType" varchar, "refId" varchar, "idempotencyKey" varchar NOT NULL, "createdAt" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ledger_entry_idempotency_key" ON "ledger_entry" ("idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entry_user_id" ON "ledger_entry" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entry_asset_id" ON "ledger_entry" ("assetId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "balance_read_model" ("userId" varchar NOT NULL, "assetId" varchar NOT NULL, "available" varchar NOT NULL DEFAULT ('0'), "locked" varchar NOT NULL DEFAULT ('0'), "total" varchar NOT NULL DEFAULT ('0'), "updatedAt" varchar NOT NULL, PRIMARY KEY ("userId", "assetId"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "balance_read_model"`);
    await queryRunner.query(`DROP INDEX "IDX_ledger_entry_asset_id"`);
    await queryRunner.query(`DROP INDEX "IDX_ledger_entry_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_ledger_entry_idempotency_key"`);
    await queryRunner.query(`DROP TABLE "ledger_entry"`);
  }
}
