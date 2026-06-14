import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLedgerOrderIdentityFields1780900000000
  implements MigrationInterface
{
  name = 'AddLedgerOrderIdentityFields1780900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.rebuildLedgerEntryWithOrderIdentity(queryRunner);
    await this.rebuildMarketMakingOrderBalanceWithOrderIdentity(queryRunner);
    await this.rebuildTrackedOrderWithOrderIdentity(queryRunner);
    await this.rebuildExchangeOrderMappingWithOrderIdentity(queryRunner);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.rebuildExchangeOrderMappingWithoutOrderIdentity(queryRunner);
    await this.rebuildTrackedOrderWithoutOrderIdentity(queryRunner);
    await this.rebuildMarketMakingOrderBalanceWithoutOrderIdentity(queryRunner);
    await this.rebuildLedgerEntryWithoutOrderIdentity(queryRunner);
  }

  private userOrderIdFromOrderIdSql(): string {
    return `CASE
      WHEN "orderId" LIKE '%:maker' THEN substr("orderId", 1, length("orderId") - 6)
      WHEN "orderId" LIKE '%:taker' THEN substr("orderId", 1, length("orderId") - 6)
      ELSE "orderId"
    END`;
  }

  private accountLabelFromOrderIdSql(fallbackSql: string): string {
    return `CASE
      WHEN "orderId" LIKE '%:maker' THEN 'maker'
      WHEN "orderId" LIKE '%:taker' THEN 'taker'
      ELSE ${fallbackSql}
    END`;
  }

  private async rebuildLedgerEntryWithOrderIdentity(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "temporary_ledger_entry" (
        "entryId" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "userOrderId" varchar NOT NULL,
        "accountLabel" varchar NOT NULL DEFAULT ('default'),
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
      )
    `);
    await queryRunner.query(`
      INSERT INTO "temporary_ledger_entry"(
        "entryId", "orderId", "userOrderId", "accountLabel", "userId",
        "assetId", "amount", "type", "refType", "refId", "idempotencyKey",
        "idempotencyContentHash", "reversalOf", "createdAt"
      )
      SELECT
        "entryId",
        "orderId",
        ${this.userOrderIdFromOrderIdSql()},
        ${this.accountLabelFromOrderIdSql("'default'")},
        "userId",
        "assetId",
        "amount",
        "type",
        "refType",
        "refId",
        "idempotencyKey",
        "idempotencyContentHash",
        "reversalOf",
        "createdAt"
      FROM "ledger_entry"
    `);
    await queryRunner.query(`DROP TABLE "ledger_entry"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_ledger_entry" RENAME TO "ledger_entry"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_648635a12ec8f4f524c203f0ab" ON "ledger_entry" ("orderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d90bdf76a4e458e2b0963a73b0" ON "ledger_entry" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c016e418abaf6664d00dc190f7" ON "ledger_entry" ("assetId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entry_user_order_id" ON "ledger_entry" ("userOrderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entry_account_label" ON "ledger_entry" ("accountLabel")`,
    );
  }

  private async rebuildMarketMakingOrderBalanceWithOrderIdentity(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "temporary_market_making_order_balance" (
        "orderId" varchar NOT NULL,
        "userOrderId" varchar NOT NULL,
        "accountLabel" varchar NOT NULL DEFAULT ('default'),
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
      )
    `);
    await queryRunner.query(`
      INSERT INTO "temporary_market_making_order_balance"(
        "orderId", "userOrderId", "accountLabel", "userId", "assetId",
        "available", "locked", "total", "initialDeposit", "realizedDelta",
        "feePaid", "updatedAt"
      )
      SELECT
        "orderId",
        ${this.userOrderIdFromOrderIdSql()},
        ${this.accountLabelFromOrderIdSql("'default'")},
        "userId",
        "assetId",
        "available",
        "locked",
        "total",
        "initialDeposit",
        "realizedDelta",
        "feePaid",
        "updatedAt"
      FROM "market_making_order_balance"
    `);
    await queryRunner.query(`DROP TABLE "market_making_order_balance"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_market_making_order_balance" RENAME TO "market_making_order_balance"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ea79c038e6ea5b5759839f369e" ON "market_making_order_balance" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_market_making_order_balance_user_order_id" ON "market_making_order_balance" ("userOrderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_market_making_order_balance_account_label" ON "market_making_order_balance" ("accountLabel")`,
    );
  }

  private async rebuildTrackedOrderWithOrderIdentity(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "temporary_tracked_order" (
        "trackingKey" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "userOrderId" varchar NOT NULL,
        "strategyKey" varchar NOT NULL,
        "exchange" varchar NOT NULL,
        "accountLabel" varchar,
        "pair" varchar NOT NULL,
        "exchangeOrderId" varchar NOT NULL,
        "clientOrderId" varchar,
        "slotKey" varchar,
        "role" varchar,
        "side" varchar NOT NULL,
        "price" varchar NOT NULL,
        "qty" varchar NOT NULL,
        "cumulativeFilledQty" varchar,
        "settledFilledQty" varchar,
        "status" varchar NOT NULL,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL
      )
    `);
    await queryRunner.query(`
      INSERT INTO "temporary_tracked_order"(
        "trackingKey", "orderId", "userOrderId", "strategyKey", "exchange",
        "accountLabel", "pair", "exchangeOrderId", "clientOrderId",
        "slotKey", "role", "side", "price", "qty", "cumulativeFilledQty",
        "settledFilledQty", "status", "createdAt", "updatedAt"
      )
      SELECT
        "trackingKey",
        "orderId",
        ${this.userOrderIdFromOrderIdSql()},
        "strategyKey",
        "exchange",
        ${this.accountLabelFromOrderIdSql(
          `COALESCE("accountLabel", 'default')`,
        )},
        "pair",
        "exchangeOrderId",
        "clientOrderId",
        "slotKey",
        "role",
        "side",
        "price",
        "qty",
        "cumulativeFilledQty",
        "settledFilledQty",
        "status",
        "createdAt",
        "updatedAt"
      FROM "tracked_order"
    `);
    await queryRunner.query(`DROP TABLE "tracked_order"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_tracked_order" RENAME TO "tracked_order"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_117b4b02ef4d18a96445c6f223" ON "tracked_order" ("trackingKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_626e1085f4b77f5e5cfa4fdd96" ON "tracked_order" ("strategyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tracked_order_user_order_id" ON "tracked_order" ("userOrderId")`,
    );
  }

  private async rebuildExchangeOrderMappingWithOrderIdentity(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "temporary_exchange_order_mapping" (
        "id" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "userOrderId" varchar NOT NULL,
        "accountLabel" varchar NOT NULL DEFAULT ('default'),
        "exchange" varchar NOT NULL DEFAULT (''),
        "exchangeOrderId" varchar,
        "clientOrderId" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      INSERT INTO "temporary_exchange_order_mapping"(
        "id", "orderId", "userOrderId", "accountLabel", "exchange",
        "exchangeOrderId", "clientOrderId", "createdAt"
      )
      SELECT
        "id",
        "orderId",
        ${this.userOrderIdFromOrderIdSql()},
        ${this.accountLabelFromOrderIdSql("'default'")},
        '',
        "exchangeOrderId",
        "clientOrderId",
        "createdAt"
      FROM "exchange_order_mapping"
    `);
    await queryRunner.query(`DROP TABLE "exchange_order_mapping"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_exchange_order_mapping" RENAME TO "exchange_order_mapping"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_order_mapping_order_id" ON "exchange_order_mapping" ("orderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_order_mapping_user_order_id" ON "exchange_order_mapping" ("userOrderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_order_mapping_account_label" ON "exchange_order_mapping" ("accountLabel")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_order_mapping_exchange" ON "exchange_order_mapping" ("exchange")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_order_mapping_exchange_order_id" ON "exchange_order_mapping" ("exchangeOrderId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_exchange_order_mapping_client_order_id" ON "exchange_order_mapping" ("clientOrderId")`,
    );
  }

  private async rebuildExchangeOrderMappingWithoutOrderIdentity(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "temporary_exchange_order_mapping" (
        "id" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "exchangeOrderId" varchar,
        "clientOrderId" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      INSERT INTO "temporary_exchange_order_mapping"(
        "id", "orderId", "exchangeOrderId", "clientOrderId", "createdAt"
      )
      SELECT "id", "orderId", "exchangeOrderId", "clientOrderId", "createdAt"
      FROM "exchange_order_mapping"
    `);
    await queryRunner.query(`DROP TABLE "exchange_order_mapping"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_exchange_order_mapping" RENAME TO "exchange_order_mapping"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_order_mapping_order_id" ON "exchange_order_mapping" ("orderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_order_mapping_exchange_order_id" ON "exchange_order_mapping" ("exchangeOrderId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_exchange_order_mapping_client_order_id" ON "exchange_order_mapping" ("clientOrderId")`,
    );
  }

  private async rebuildTrackedOrderWithoutOrderIdentity(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "temporary_tracked_order" (
        "trackingKey" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "strategyKey" varchar NOT NULL,
        "exchange" varchar NOT NULL,
        "accountLabel" varchar,
        "pair" varchar NOT NULL,
        "exchangeOrderId" varchar NOT NULL,
        "clientOrderId" varchar,
        "slotKey" varchar,
        "role" varchar,
        "side" varchar NOT NULL,
        "price" varchar NOT NULL,
        "qty" varchar NOT NULL,
        "cumulativeFilledQty" varchar,
        "settledFilledQty" varchar,
        "status" varchar NOT NULL,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL
      )
    `);
    await queryRunner.query(`
      INSERT INTO "temporary_tracked_order"(
        "trackingKey", "orderId", "strategyKey", "exchange", "accountLabel",
        "pair", "exchangeOrderId", "clientOrderId", "slotKey", "role",
        "side", "price", "qty", "cumulativeFilledQty", "settledFilledQty",
        "status", "createdAt", "updatedAt"
      )
      SELECT
        "trackingKey", "orderId", "strategyKey", "exchange", "accountLabel",
        "pair", "exchangeOrderId", "clientOrderId", "slotKey", "role",
        "side", "price", "qty", "cumulativeFilledQty", "settledFilledQty",
        "status", "createdAt", "updatedAt"
      FROM "tracked_order"
    `);
    await queryRunner.query(`DROP TABLE "tracked_order"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_tracked_order" RENAME TO "tracked_order"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_117b4b02ef4d18a96445c6f223" ON "tracked_order" ("trackingKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_626e1085f4b77f5e5cfa4fdd96" ON "tracked_order" ("strategyKey")`,
    );
  }

  private async rebuildMarketMakingOrderBalanceWithoutOrderIdentity(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "temporary_market_making_order_balance" (
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
      )
    `);
    await queryRunner.query(`
      INSERT INTO "temporary_market_making_order_balance"(
        "orderId", "userId", "assetId", "available", "locked", "total",
        "initialDeposit", "realizedDelta", "feePaid", "updatedAt"
      )
      SELECT
        "orderId", "userId", "assetId", "available", "locked", "total",
        "initialDeposit", "realizedDelta", "feePaid", "updatedAt"
      FROM "market_making_order_balance"
    `);
    await queryRunner.query(`DROP TABLE "market_making_order_balance"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_market_making_order_balance" RENAME TO "market_making_order_balance"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ea79c038e6ea5b5759839f369e" ON "market_making_order_balance" ("userId")`,
    );
  }

  private async rebuildLedgerEntryWithoutOrderIdentity(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "temporary_ledger_entry" (
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
      )
    `);
    await queryRunner.query(`
      INSERT INTO "temporary_ledger_entry"(
        "entryId", "orderId", "userId", "assetId", "amount", "type",
        "refType", "refId", "idempotencyKey", "idempotencyContentHash",
        "reversalOf", "createdAt"
      )
      SELECT
        "entryId", "orderId", "userId", "assetId", "amount", "type",
        "refType", "refId", "idempotencyKey", "idempotencyContentHash",
        "reversalOf", "createdAt"
      FROM "ledger_entry"
    `);
    await queryRunner.query(`DROP TABLE "ledger_entry"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_ledger_entry" RENAME TO "ledger_entry"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_648635a12ec8f4f524c203f0ab" ON "ledger_entry" ("orderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d90bdf76a4e458e2b0963a73b0" ON "ledger_entry" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c016e418abaf6664d00dc190f7" ON "ledger_entry" ("assetId")`,
    );
  }
}
