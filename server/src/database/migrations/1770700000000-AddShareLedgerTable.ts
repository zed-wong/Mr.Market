import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShareLedgerTable1770700000000 implements MigrationInterface {
  name = 'AddShareLedgerTable1770700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "share_ledger_entry" ("entryId" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "type" varchar NOT NULL, "amount" varchar NOT NULL, "refId" varchar NOT NULL, "createdAt" varchar NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "share_ledger_entry"`);
  }
}
