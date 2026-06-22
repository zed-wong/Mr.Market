import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderLpPositions1781600000000 implements MigrationInterface {
  name = 'AddOrderLpPositions1781600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "order_lp_positions" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userOrderId" varchar NOT NULL,
        "ledgerOrderId" varchar NOT NULL,
        "accountLabel" varchar NOT NULL DEFAULT ('default'),
        "connectorId" varchar NOT NULL,
        "chainId" integer NOT NULL,
        "tradingAccountId" varchar NOT NULL,
        "positionTokenId" varchar NOT NULL,
        "poolAddress" varchar NOT NULL,
        "token0" varchar NOT NULL,
        "token1" varchar NOT NULL,
        "feeTier" integer NOT NULL,
        "tickLower" integer NOT NULL,
        "tickUpper" integer NOT NULL,
        "liquidity" varchar NOT NULL,
        "status" varchar NOT NULL,
        "openedByIntentId" varchar NOT NULL,
        "closedByIntentId" varchar,
        "lastConfirmedBlock" integer,
        "uncollectedFees0" varchar,
        "uncollectedFees1" varchar,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL,
        CONSTRAINT "UQ_order_lp_position_connector_chain_token" UNIQUE ("connectorId", "chainId", "positionTokenId")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_lp_position_user_account" ON "order_lp_positions" ("userOrderId", "accountLabel")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_lp_position_user_order" ON "order_lp_positions" ("userOrderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_lp_position_ledger_order" ON "order_lp_positions" ("ledgerOrderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_lp_position_chain" ON "order_lp_positions" ("chainId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_lp_position_account" ON "order_lp_positions" ("tradingAccountId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_lp_position_status" ON "order_lp_positions" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_order_lp_position_status"`);
    await queryRunner.query(`DROP INDEX "IDX_order_lp_position_account"`);
    await queryRunner.query(`DROP INDEX "IDX_order_lp_position_chain"`);
    await queryRunner.query(`DROP INDEX "IDX_order_lp_position_ledger_order"`);
    await queryRunner.query(`DROP INDEX "IDX_order_lp_position_user_order"`);
    await queryRunner.query(`DROP INDEX "IDX_order_lp_position_user_account"`);
    await queryRunner.query(`DROP TABLE "order_lp_positions"`);
  }
}
