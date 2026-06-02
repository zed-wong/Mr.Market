import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeb3FundingRequestStartBlockNumber1780400000000
  implements MigrationInterface
{
  name = 'AddWeb3FundingRequestStartBlockNumber1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('web3_funding_request'))) {
      return;
    }

    if (await queryRunner.hasColumn('web3_funding_request', 'startBlockNumber')) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "web3_funding_request" ADD COLUMN "startBlockNumber" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('web3_funding_request'))) {
      return;
    }

    if (!(await queryRunner.hasColumn('web3_funding_request', 'startBlockNumber'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "web3_funding_request" DROP COLUMN "startBlockNumber"`,
    );
  }
}
