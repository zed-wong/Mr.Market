import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrackedOrderTable1775700000000 implements MigrationInterface {
  name = 'AddTrackedOrderTable1775700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tracked_order" ("trackingKey" varchar PRIMARY KEY NOT NULL, "orderId" varchar NOT NULL, "strategyKey" varchar NOT NULL, "exchange" varchar NOT NULL, "pair" varchar NOT NULL, "exchangeOrderId" varchar NOT NULL, "clientOrderId" varchar, "side" varchar NOT NULL, "price" varchar NOT NULL, "qty" varchar NOT NULL, "cumulativeFilledQty" varchar, "status" varchar NOT NULL, "createdAt" varchar NOT NULL, "updatedAt" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tracked_order_trackingKey" ON "tracked_order" ("trackingKey") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tracked_order_strategyKey" ON "tracked_order" ("strategyKey") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_tracked_order_strategyKey"`);
    await queryRunner.query(`DROP INDEX "IDX_tracked_order_trackingKey"`);
    await queryRunner.query(`DROP TABLE "tracked_order"`);
  }
}
