import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdToEvmExecutions1781500000000
  implements MigrationInterface
{
  name = 'AddUserIdToEvmExecutions1781500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "evm_executions" ADD "userId" varchar`);
    await queryRunner.query(
      `UPDATE "evm_executions" SET "userId" = "userOrderId" WHERE "userId" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evm_execution_user" ON "evm_executions" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_evm_execution_user"`);
    await queryRunner.query(`ALTER TABLE "evm_executions" DROP COLUMN "userId"`);
  }
}
