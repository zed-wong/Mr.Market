import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDurabilityTables1770400000000 implements MigrationInterface {
  name = 'AddDurabilityTables1770400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "outbox_event" ("eventId" varchar PRIMARY KEY NOT NULL, "topic" varchar NOT NULL, "aggregateType" varchar NOT NULL, "aggregateId" varchar NOT NULL, "payload" text NOT NULL, "createdAt" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_event_topic" ON "outbox_event" ("topic")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_event_aggregate_type" ON "outbox_event" ("aggregateType")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_event_aggregate_id" ON "outbox_event" ("aggregateId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "consumer_receipt" ("receiptId" varchar PRIMARY KEY NOT NULL, "consumerName" varchar NOT NULL, "idempotencyKey" varchar NOT NULL, "status" varchar NOT NULL, "processedAt" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_consumer_receipt_consumer_name" ON "consumer_receipt" ("consumerName")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_consumer_receipt_idempotency_key" ON "consumer_receipt" ("idempotencyKey")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_consumer_receipt_idempotency_key"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_consumer_receipt_consumer_name"`);
    await queryRunner.query(`DROP TABLE "consumer_receipt"`);
    await queryRunner.query(`DROP INDEX "IDX_outbox_event_aggregate_id"`);
    await queryRunner.query(`DROP INDEX "IDX_outbox_event_aggregate_type"`);
    await queryRunner.query(`DROP INDEX "IDX_outbox_event_topic"`);
    await queryRunner.query(`DROP TABLE "outbox_event"`);
  }
}
