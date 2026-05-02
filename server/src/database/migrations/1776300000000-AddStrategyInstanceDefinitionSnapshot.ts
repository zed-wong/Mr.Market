import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddStrategyInstanceDefinitionSnapshot1776300000000
  implements MigrationInterface
{
  name = 'AddStrategyInstanceDefinitionSnapshot1776300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('strategy_instances'))) {
      return;
    }

    const table = await queryRunner.getTable('strategy_instances');

    if (
      table?.columns.some(
        (column) => column.name === 'strategyDefinitionSnapshot',
      )
    ) {
      return;
    }

    await queryRunner.addColumn(
      'strategy_instances',
      new TableColumn({
        name: 'strategyDefinitionSnapshot',
        type: 'text',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('strategy_instances'))) {
      return;
    }

    const table = await queryRunner.getTable('strategy_instances');

    if (
      !table?.columns.some(
        (column) => column.name === 'strategyDefinitionSnapshot',
      )
    ) {
      return;
    }

    await queryRunner.dropColumn(
      'strategy_instances',
      'strategyDefinitionSnapshot',
    );
  }
}
