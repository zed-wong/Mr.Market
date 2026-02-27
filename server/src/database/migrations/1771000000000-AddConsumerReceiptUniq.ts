import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConsumerReceiptUniq1771000000000 implements MigrationInterface {
  name = 'AddConsumerReceiptUniq1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_consumer_receipt_consumer_idempotency" ON "consumer_receipt" ("consumerName", "idempotencyKey")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_consumer_receipt_consumer_idempotency"`,
    );
  }
}
