import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketMakingOrderIntent1770000000000
  implements MigrationInterface
{
  name = 'AddMarketMakingOrderIntent1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "market_making_order_intent" ("orderId" varchar PRIMARY KEY NOT NULL, "userId" varchar, "marketMakingPairId" varchar NOT NULL, "state" varchar NOT NULL DEFAULT ('pending'), "createdAt" varchar NOT NULL, "updatedAt" varchar NOT NULL, "expiresAt" varchar NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "market_making_order_intent"`);
  }
}
