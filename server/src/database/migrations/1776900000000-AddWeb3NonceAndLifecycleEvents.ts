import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeb3NonceAndLifecycleEvents1776900000000
  implements MigrationInterface
{
  name = 'AddWeb3NonceAndLifecycleEvents1776900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "web3_login_nonce" (
        "nonce" varchar PRIMARY KEY NOT NULL,
        "address" varchar NOT NULL,
        "chainId" varchar NOT NULL,
        "domain" varchar NOT NULL,
        "statement" varchar NOT NULL,
        "uri" varchar NOT NULL,
        "issuedAt" varchar NOT NULL,
        "expiresAt" varchar NOT NULL,
        "consumedAt" varchar
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_web3_login_nonce_address" ON "web3_login_nonce" ("address")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_web3_login_nonce_chainId" ON "web3_login_nonce" ("chainId")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "market_making_lifecycle_event" (
        "eventId" varchar PRIMARY KEY NOT NULL,
        "orderId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "type" varchar NOT NULL,
        "timestamp" varchar NOT NULL,
        "fromState" varchar,
        "toState" varchar,
        "refType" varchar,
        "refId" varchar,
        "metadata" text
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_market_making_lifecycle_event_orderId" ON "market_making_lifecycle_event" ("orderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_market_making_lifecycle_event_userId" ON "market_making_lifecycle_event" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_market_making_lifecycle_event_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_market_making_lifecycle_event_orderId"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "market_making_lifecycle_event"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_web3_login_nonce_chainId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_web3_login_nonce_address"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "web3_login_nonce"`);
  }
}
