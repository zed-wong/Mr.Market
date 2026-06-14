import { MigrationInterface, QueryRunner } from 'typeorm';

const LEGACY_DEFINITION_KEYS = [
  'dual_account_volume',
  'dual-account-volume',
  'dual_account_best_capacity_volume',
  'dual-account-best-capacity-volume',
];

const LEGACY_CONTROLLER_TYPES = [
  'dualAccountVolume',
  'dualAccountBestCapacityVolume',
];

export class RemoveLegacyDualAccountVolumeDefinitions1781000000000
  implements MigrationInterface
{
  name = 'RemoveLegacyDualAccountVolumeDefinitions1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const nowExpression = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

    if (await this.tableExists(queryRunner, 'strategy_instances')) {
      await queryRunner.query(
        `UPDATE "strategy_instances"
         SET "status" = 'failed',
             "updatedAt" = ${nowExpression}
         WHERE "strategyType" IN (${this.placeholders(
           LEGACY_CONTROLLER_TYPES,
         )})
           AND "status" IN ('running', 'stopping')`,
        LEGACY_CONTROLLER_TYPES,
      );
    }

    if (!(await this.tableExists(queryRunner, 'strategy_definitions'))) {
      return;
    }

    await queryRunner.query(
      `DELETE FROM "strategy_definitions"
       WHERE "key" IN (${this.placeholders(LEGACY_DEFINITION_KEYS)})
          OR "controllerType" IN (${this.placeholders(
            LEGACY_CONTROLLER_TYPES,
          )})`,
      [...LEGACY_DEFINITION_KEYS, ...LEGACY_CONTROLLER_TYPES],
    );
  }

  public async down(): Promise<void> {
    return;
  }

  private async tableExists(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [tableName],
    );

    return rows.length > 0;
  }

  private placeholders(values: unknown[]): string {
    return values.map(() => '?').join(', ');
  }
}
