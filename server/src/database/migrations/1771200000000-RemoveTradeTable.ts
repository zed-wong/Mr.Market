import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTradeTable1771200000000 implements MigrationInterface {
  name = 'RemoveTradeTable1771200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "trade"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "trade" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" varchar NOT NULL, "clientId" varchar NOT NULL, "symbol" varchar NOT NULL, "side" varchar NOT NULL, "type" varchar NOT NULL, "amount" text NOT NULL, "price" text NOT NULL, "status" varchar NOT NULL DEFAULT ('pending'), "orderId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
  }
}
