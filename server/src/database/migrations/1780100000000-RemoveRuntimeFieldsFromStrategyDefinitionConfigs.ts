import { MigrationInterface, QueryRunner } from 'typeorm';

type StrategyDefinitionRow = {
  id: string;
  configSchema: string;
  defaultConfig: string;
};

const RUNTIME_CONFIG_FIELDS = ['pair', 'exchangeName'];

export class RemoveRuntimeFieldsFromStrategyDefinitionConfigs1780100000000
  implements MigrationInterface
{
  name = 'RemoveRuntimeFieldsFromStrategyDefinitionConfigs1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.cleanTable(queryRunner, 'strategy_definitions', 'id');
    await this.cleanTable(queryRunner, 'strategy_definition_versions', 'id');
  }

  public async down(): Promise<void> {
    // Runtime fields are injected from orders at launch time. Re-adding old
    // defaults would make migrated definitions depend on stale exchange/pair.
  }

  private async cleanTable(
    queryRunner: QueryRunner,
    tableName: string,
    idColumn: string,
  ): Promise<void> {
    if (!(await this.tableExists(queryRunner, tableName))) {
      return;
    }

    const rows: StrategyDefinitionRow[] = await queryRunner.query(
      `SELECT "${idColumn}" as id, "configSchema", "defaultConfig" FROM "${tableName}"`,
    );

    for (const row of rows) {
      const parsedConfigSchema = this.parseJsonObject(row.configSchema);
      const parsedDefaultConfig = this.parseJsonObject(row.defaultConfig);

      if (!parsedConfigSchema || !parsedDefaultConfig) {
        continue;
      }

      const configSchema =
        this.removeRuntimeFieldsFromSchema(parsedConfigSchema);
      const defaultConfig =
        this.removeRuntimeFieldsFromConfig(parsedDefaultConfig);

      await queryRunner.query(
        `UPDATE "${tableName}" SET "configSchema" = ?, "defaultConfig" = ? WHERE "${idColumn}" = ?`,
        [JSON.stringify(configSchema), JSON.stringify(defaultConfig), row.id],
      );
    }
  }

  private async tableExists(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<boolean> {
    const rows: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [tableName],
    );

    return rows.length > 0;
  }

  private parseJsonObject(value: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(value);

      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private removeRuntimeFieldsFromSchema(
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    const required = Array.isArray(schema.required)
      ? schema.required.filter(
          (field) =>
            typeof field !== 'string' || !RUNTIME_CONFIG_FIELDS.includes(field),
        )
      : schema.required;
    const properties =
      schema.properties &&
      typeof schema.properties === 'object' &&
      !Array.isArray(schema.properties)
        ? { ...(schema.properties as Record<string, unknown>) }
        : schema.properties;

    if (
      properties &&
      typeof properties === 'object' &&
      !Array.isArray(properties)
    ) {
      for (const field of RUNTIME_CONFIG_FIELDS) {
        delete (properties as Record<string, unknown>)[field];
      }
    }

    return {
      ...schema,
      ...(required ? { required } : {}),
      ...(properties ? { properties } : {}),
    };
  }

  private removeRuntimeFieldsFromConfig(
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const cleaned = { ...config };

    for (const field of RUNTIME_CONFIG_FIELDS) {
      delete cleaned[field];
    }

    return cleaned;
  }
}
