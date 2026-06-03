import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeb3WithdrawalStartBlockNumber1780500000000
  implements MigrationInterface
{
  name = 'AddWeb3WithdrawalStartBlockNumber1780500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('web3_withdrawal'))) {
      return;
    }

    if (await queryRunner.hasColumn('web3_withdrawal', 'startBlockNumber')) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" ADD COLUMN "startBlockNumber" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('web3_withdrawal'))) {
      return;
    }

    if (!(await queryRunner.hasColumn('web3_withdrawal', 'startBlockNumber'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "web3_withdrawal" DROP COLUMN "startBlockNumber"`,
    );
  }
}
