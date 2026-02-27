import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShareLedgerIdempotencyUniq1771100000000
  implements MigrationInterface
{
  name = 'AddShareLedgerIdempotencyUniq1771100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_share_ledger_user_type_ref" ON "share_ledger_entry" ("userId", "type", "refId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_share_ledger_user_type_ref"`);
  }
}
