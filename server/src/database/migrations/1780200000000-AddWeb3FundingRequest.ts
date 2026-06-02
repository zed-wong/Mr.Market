import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeb3FundingRequest1780200000000 implements MigrationInterface {
  name = 'AddWeb3FundingRequest1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "web3_funding_request" (
        "requestId" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "evmAddress" varchar NOT NULL,
        "chainId" integer NOT NULL,
        "routerAddress" varchar NOT NULL,
        "receiverAddress" varchar NOT NULL,
        "tokenAddress" varchar NOT NULL,
        "assetId" varchar NOT NULL,
        "amount" varchar NOT NULL,
        "payloadHash" varchar NOT NULL,
        "requestSecret" varchar NOT NULL,
        "orderDraftJson" text NOT NULL,
        "status" varchar NOT NULL,
        "txHash" varchar,
        "logIndex" integer,
        "startBlockNumber" integer,
        "orderId" varchar,
        "rejectionReason" varchar,
        "createdAt" varchar NOT NULL,
        "expiresAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_web3_funding_request_user_id" ON "web3_funding_request" ("userId")`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "web3_event_log" (
        "id" varchar PRIMARY KEY NOT NULL,
        "chainId" integer NOT NULL,
        "contractAddress" varchar NOT NULL,
        "eventName" varchar NOT NULL,
        "txHash" varchar NOT NULL,
        "logIndex" integer NOT NULL,
        "blockNumber" integer,
        "payloadJson" text NOT NULL,
        "processedAt" varchar NOT NULL,
        "createdAt" varchar NOT NULL
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_web3_event_log_chain_tx_log" ON "web3_event_log" ("chainId", "txHash", "logIndex")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_web3_event_log_chain_tx_log"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "web3_event_log"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_web3_funding_request_user_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "web3_funding_request"`);
  }
}
