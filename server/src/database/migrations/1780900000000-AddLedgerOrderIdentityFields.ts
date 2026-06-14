import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLedgerOrderIdentityFields1780900000000
  implements MigrationInterface
{
  name = 'AddLedgerOrderIdentityFields1780900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ledger_entry" ADD "userOrderId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entry" ADD "accountLabel" character varying DEFAULT 'default'`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" ADD "userOrderId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" ADD "accountLabel" character varying DEFAULT 'default'`,
    );
    await queryRunner.query(
      `ALTER TABLE "tracked_order" ADD "userOrderId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" ADD "userOrderId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" ADD "accountLabel" character varying DEFAULT 'default'`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" ADD "exchange" character varying DEFAULT ''`,
    );

    for (const table of [
      'ledger_entry',
      'market_making_order_balance',
      'tracked_order',
      'exchange_order_mapping',
    ]) {
      await queryRunner.query(`
        UPDATE "${table}"
        SET
          "userOrderId" = CASE
            WHEN "orderId" LIKE '%:maker' THEN substr("orderId", 1, length("orderId") - 6)
            WHEN "orderId" LIKE '%:taker' THEN substr("orderId", 1, length("orderId") - 6)
            ELSE "orderId"
          END,
          "accountLabel" = CASE
            WHEN "orderId" LIKE '%:maker' THEN 'maker'
            WHEN "orderId" LIKE '%:taker' THEN 'taker'
            ELSE COALESCE("accountLabel", 'default')
          END
      `);
    }

    await queryRunner.query(
      `ALTER TABLE "ledger_entry" ALTER COLUMN "userOrderId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entry" ALTER COLUMN "accountLabel" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" ALTER COLUMN "userOrderId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" ALTER COLUMN "accountLabel" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tracked_order" ALTER COLUMN "userOrderId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" ALTER COLUMN "userOrderId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" ALTER COLUMN "accountLabel" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" ALTER COLUMN "exchange" SET NOT NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entry_user_order_id" ON "ledger_entry" ("userOrderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entry_account_label" ON "ledger_entry" ("accountLabel")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_market_making_order_balance_user_order_id" ON "market_making_order_balance" ("userOrderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_market_making_order_balance_account_label" ON "market_making_order_balance" ("accountLabel")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tracked_order_user_order_id" ON "tracked_order" ("userOrderId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_tracked_order_user_order_id"`);
    await queryRunner.query(
      `DROP INDEX "IDX_market_making_order_balance_account_label"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_market_making_order_balance_user_order_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_ledger_entry_account_label"`);
    await queryRunner.query(`DROP INDEX "IDX_ledger_entry_user_order_id"`);
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" DROP COLUMN "exchange"`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" DROP COLUMN "accountLabel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" DROP COLUMN "userOrderId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tracked_order" DROP COLUMN "userOrderId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" DROP COLUMN "accountLabel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" DROP COLUMN "userOrderId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entry" DROP COLUMN "accountLabel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entry" DROP COLUMN "userOrderId"`,
    );
  }
}
