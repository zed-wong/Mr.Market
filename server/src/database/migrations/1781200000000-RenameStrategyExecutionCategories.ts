import { MigrationInterface, QueryRunner } from 'typeorm';

type StrategyDefinitionRow = {
  id: string;
  configSchema: string;
  defaultConfig: string;
};

export class RenameStrategyExecutionCategories1781200000000
  implements MigrationInterface
{
  name = 'RenameStrategyExecutionCategories1781200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.cleanTable(queryRunner, 'strategy_definitions', 'id');
    await this.cleanTable(queryRunner, 'strategy_definition_versions', 'id');
  }

  public async down(): Promise<void> {
    // The connector taxonomy uses clob/amm as the source-of-truth names.
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
      const configSchema = this.parseJsonObject(row.configSchema);
      const defaultConfig = this.parseJsonObject(row.defaultConfig);

      if (!configSchema || !defaultConfig) {
        continue;
      }

      const nextConfigSchema = this.renameSchemaCategories(configSchema);
      const nextDefaultConfig = this.renameConfigCategories(defaultConfig);

      if (
        JSON.stringify(nextConfigSchema) === row.configSchema &&
        JSON.stringify(nextDefaultConfig) === row.defaultConfig
      ) {
        continue;
      }

      await queryRunner.query(
        `UPDATE "${tableName}" SET "configSchema" = ?, "defaultConfig" = ? WHERE "${idColumn}" = ?`,
        [
          JSON.stringify(nextConfigSchema),
          JSON.stringify(nextDefaultConfig),
          row.id,
        ],
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

  private renameSchemaCategories(
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    const properties =
      schema.properties &&
      typeof schema.properties === 'object' &&
      !Array.isArray(schema.properties)
        ? { ...(schema.properties as Record<string, unknown>) }
        : undefined;

    if (!properties) {
      return schema;
    }

    const executionCategory = properties.executionCategory;

    if (
      !executionCategory ||
      typeof executionCategory !== 'object' ||
      Array.isArray(executionCategory)
    ) {
      return schema;
    }

    const nextExecutionCategory = { ...executionCategory } as Record<
      string,
      unknown
    >;

    if (Array.isArray(nextExecutionCategory.enum)) {
      nextExecutionCategory.enum = nextExecutionCategory.enum.map((value) =>
        this.renameCategoryValue(value),
      );
    }

    return {
      ...schema,
      properties: {
        ...properties,
        executionCategory: nextExecutionCategory,
      },
    };
  }

  private renameConfigCategories(
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    if (config.executionCategory === undefined) {
      return config;
    }

    return {
      ...config,
      executionCategory: this.renameCategoryValue(config.executionCategory),
    };
  }

  private renameCategoryValue(value: unknown): unknown {
    if (value === 'clob_cex') {
      return 'clob';
    }

    if (value === 'amm_dex') {
      return 'amm';
    }

    return value;
  }
}
