import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTradingAccountTokenRegistry1781300000000
  implements MigrationInterface
{
  name = 'AddTradingAccountTokenRegistry1781300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "trading_accounts" (
        "id" varchar PRIMARY KEY NOT NULL,
        "label" varchar NOT NULL,
        "type" varchar NOT NULL,
        "purpose" varchar NOT NULL,
        "chainIds" text NOT NULL,
        "walletAddress" varchar NOT NULL,
        "encryptedPrivateKey" varchar NOT NULL,
        "validationStatus" varchar NOT NULL DEFAULT ('pending'),
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trading_accounts_type" ON "trading_accounts" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trading_accounts_purpose" ON "trading_accounts" ("purpose")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trading_accounts_wallet" ON "trading_accounts" ("walletAddress")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trading_accounts_validation" ON "trading_accounts" ("validationStatus")`,
    );

    await queryRunner.query(
      `CREATE TABLE "token_registry" (
        "assetId" varchar PRIMARY KEY NOT NULL,
        "chainId" integer NOT NULL,
        "contractAddress" varchar NOT NULL,
        "symbol" varchar NOT NULL,
        "decimals" integer NOT NULL,
        "isNative" boolean NOT NULL DEFAULT (0),
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL,
        CONSTRAINT "UQ_token_registry_chain_contract" UNIQUE ("chainId", "contractAddress")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_token_registry_chain" ON "token_registry" ("chainId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "ledger_entry" ADD "tradingAccountId" varchar`,
    );
    await queryRunner.query(`ALTER TABLE "ledger_entry" ADD "chainId" integer`);
    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entry_trading_account" ON "ledger_entry" ("tradingAccountId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entry_chain" ON "ledger_entry" ("chainId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" ADD "externalLocked" varchar NOT NULL DEFAULT ('0')`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" ADD "tradingAccountId" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" ADD "chainId" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_mm_order_balance_trading_account" ON "market_making_order_balance" ("tradingAccountId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_mm_order_balance_chain" ON "market_making_order_balance" ("chainId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_mm_order_balance_chain"`);
    await queryRunner.query(`DROP INDEX "IDX_mm_order_balance_trading_account"`);
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" DROP COLUMN "chainId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" DROP COLUMN "tradingAccountId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" DROP COLUMN "externalLocked"`,
    );

    await queryRunner.query(`DROP INDEX "IDX_ledger_entry_chain"`);
    await queryRunner.query(`DROP INDEX "IDX_ledger_entry_trading_account"`);
    await queryRunner.query(`ALTER TABLE "ledger_entry" DROP COLUMN "chainId"`);
    await queryRunner.query(
      `ALTER TABLE "ledger_entry" DROP COLUMN "tradingAccountId"`,
    );

    await queryRunner.query(`DROP INDEX "IDX_token_registry_chain"`);
    await queryRunner.query(`DROP TABLE "token_registry"`);
    await queryRunner.query(`DROP INDEX "IDX_trading_accounts_validation"`);
    await queryRunner.query(`DROP INDEX "IDX_trading_accounts_wallet"`);
    await queryRunner.query(`DROP INDEX "IDX_trading_accounts_purpose"`);
    await queryRunner.query(`DROP INDEX "IDX_trading_accounts_type"`);
    await queryRunner.query(`DROP TABLE "trading_accounts"`);
  }
}
