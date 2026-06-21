import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConnectorIdToStrategyOrderIntent1781100000000
  implements MigrationInterface
{
  name = 'AddConnectorIdToStrategyOrderIntent1781100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "strategy_order_intent" ADD "connectorId" varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "strategy_order_intent" DROP COLUMN "connectorId"`,
    );
  }
}
