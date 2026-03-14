import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveStrategyDefinitionVersions1772100000000
  implements MigrationInterface
{
  name = 'RemoveStrategyDefinitionVersions1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const definitionTables: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_definitions'`,
    );
    const instanceTables: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_instances'`,
    );
    const versionTables: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_definition_versions'`,
    );

    if (definitionTables.length > 0) {
      await queryRunner.query(
        `CREATE TABLE "temporary_strategy_definitions" (
          "id" varchar PRIMARY KEY NOT NULL,
          "key" varchar NOT NULL,
          "name" varchar NOT NULL,
          "description" varchar,
          "executorType" varchar NOT NULL,
          "configSchema" text NOT NULL,
          "defaultConfig" text NOT NULL,
          "enabled" boolean NOT NULL DEFAULT (1),
          "visibility" varchar NOT NULL DEFAULT ('system'),
          "createdBy" varchar,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
        )`,
      );
      await queryRunner.query(
        `INSERT INTO "temporary_strategy_definitions" (
          "id",
          "key",
          "name",
          "description",
          "executorType",
          "configSchema",
          "defaultConfig",
          "enabled",
          "visibility",
          "createdBy",
          "createdAt",
          "updatedAt"
        )
        SELECT
          "id",
          "key",
          "name",
          "description",
          "executorType",
          "configSchema",
          "defaultConfig",
          "enabled",
          "visibility",
          "createdBy",
          "createdAt",
          "updatedAt"
        FROM "strategy_definitions"`,
      );
      await queryRunner.query(`DROP TABLE "strategy_definitions"`);
      await queryRunner.query(
        `ALTER TABLE "temporary_strategy_definitions" RENAME TO "strategy_definitions"`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX "IDX_strategy_definitions_key" ON "strategy_definitions" ("key")`,
      );
    }

    if (instanceTables.length > 0) {
      const instanceColumns: Array<{ name: string }> = await queryRunner.query(
        `PRAGMA table_info("strategy_instances")`,
      );
      const hasDefinitionVersion = instanceColumns.some(
        (column) => column.name === 'definitionVersion',
      );

      if (hasDefinitionVersion) {
        await queryRunner.query(
          `CREATE TABLE "temporary_strategy_instances" (
            "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
            "strategyKey" varchar NOT NULL,
            "userId" varchar NOT NULL,
            "clientId" varchar NOT NULL,
            "strategyType" varchar NOT NULL,
            "definitionId" varchar,
            "marketMakingOrderId" varchar,
            "startPrice" integer NOT NULL,
            "parameters" json NOT NULL,
            "status" varchar NOT NULL,
            "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
            "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
          )`,
        );
        await queryRunner.query(
          `INSERT INTO "temporary_strategy_instances" (
            "id",
            "strategyKey",
            "userId",
            "clientId",
            "strategyType",
            "definitionId",
            "marketMakingOrderId",
            "startPrice",
            "parameters",
            "status",
            "createdAt",
            "updatedAt"
          )
          SELECT
            "id",
            "strategyKey",
            "userId",
            "clientId",
            "strategyType",
            "definitionId",
            "marketMakingOrderId",
            "startPrice",
            "parameters",
            "status",
            "createdAt",
            "updatedAt"
          FROM "strategy_instances"`,
        );
        await queryRunner.query(`DROP TABLE "strategy_instances"`);
        await queryRunner.query(
          `ALTER TABLE "temporary_strategy_instances" RENAME TO "strategy_instances"`,
        );
      }
    }

    if (versionTables.length > 0) {
      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_strategy_definition_versions_definition_id_version"`,
      );
      await queryRunner.query(`DROP TABLE "strategy_definition_versions"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const definitionTables: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_definitions'`,
    );
    const instanceTables: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_instances'`,
    );
    const versionTables: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_definition_versions'`,
    );

    if (definitionTables.length > 0) {
      await queryRunner.query(
        `CREATE TABLE "temporary_strategy_definitions" (
          "id" varchar PRIMARY KEY NOT NULL,
          "key" varchar NOT NULL,
          "name" varchar NOT NULL,
          "description" varchar,
          "executorType" varchar NOT NULL,
          "configSchema" text NOT NULL,
          "defaultConfig" text NOT NULL,
          "enabled" boolean NOT NULL DEFAULT (1),
          "visibility" varchar NOT NULL DEFAULT ('system'),
          "currentVersion" varchar NOT NULL DEFAULT ('1.0.0'),
          "createdBy" varchar,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
        )`,
      );
      await queryRunner.query(
        `INSERT INTO "temporary_strategy_definitions" (
          "id",
          "key",
          "name",
          "description",
          "executorType",
          "configSchema",
          "defaultConfig",
          "enabled",
          "visibility",
          "currentVersion",
          "createdBy",
          "createdAt",
          "updatedAt"
        )
        SELECT
          "id",
          "key",
          "name",
          "description",
          "executorType",
          "configSchema",
          "defaultConfig",
          "enabled",
          "visibility",
          '1.0.0',
          "createdBy",
          "createdAt",
          "updatedAt"
        FROM "strategy_definitions"`,
      );
      await queryRunner.query(`DROP TABLE "strategy_definitions"`);
      await queryRunner.query(
        `ALTER TABLE "temporary_strategy_definitions" RENAME TO "strategy_definitions"`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX "IDX_strategy_definitions_key" ON "strategy_definitions" ("key")`,
      );
    }

    if (!versionTables.length) {
      await queryRunner.query(
        `CREATE TABLE "strategy_definition_versions" (
          "id" varchar PRIMARY KEY NOT NULL,
          "definitionId" varchar NOT NULL,
          "version" varchar NOT NULL,
          "executorType" varchar NOT NULL,
          "configSchema" text NOT NULL,
          "defaultConfig" text NOT NULL,
          "description" varchar,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
        )`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX "IDX_strategy_definition_versions_definition_id_version" ON "strategy_definition_versions" ("definitionId", "version")`,
      );
      await queryRunner.query(
        `INSERT INTO "strategy_definition_versions" (
          "id",
          "definitionId",
          "version",
          "executorType",
          "configSchema",
          "defaultConfig",
          "description"
        )
        SELECT
          "id",
          "id",
          '1.0.0',
          "executorType",
          "configSchema",
          "defaultConfig",
          "description"
        FROM "strategy_definitions"`,
      );
    }

    if (instanceTables.length > 0) {
      const instanceColumns: Array<{ name: string }> = await queryRunner.query(
        `PRAGMA table_info("strategy_instances")`,
      );
      const hasDefinitionVersion = instanceColumns.some(
        (column) => column.name === 'definitionVersion',
      );

      if (!hasDefinitionVersion) {
        await queryRunner.query(
          `CREATE TABLE "temporary_strategy_instances" (
            "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
            "strategyKey" varchar NOT NULL,
            "userId" varchar NOT NULL,
            "clientId" varchar NOT NULL,
            "strategyType" varchar NOT NULL,
            "definitionId" varchar,
            "definitionVersion" varchar DEFAULT ('1.0.0'),
            "marketMakingOrderId" varchar,
            "startPrice" integer NOT NULL,
            "parameters" json NOT NULL,
            "status" varchar NOT NULL,
            "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
            "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
          )`,
        );
        await queryRunner.query(
          `INSERT INTO "temporary_strategy_instances" (
            "id",
            "strategyKey",
            "userId",
            "clientId",
            "strategyType",
            "definitionId",
            "definitionVersion",
            "marketMakingOrderId",
            "startPrice",
            "parameters",
            "status",
            "createdAt",
            "updatedAt"
          )
          SELECT
            "id",
            "strategyKey",
            "userId",
            "clientId",
            "strategyType",
            "definitionId",
            '1.0.0',
            "marketMakingOrderId",
            "startPrice",
            "parameters",
            "status",
            "createdAt",
            "updatedAt"
          FROM "strategy_instances"`,
        );
        await queryRunner.query(`DROP TABLE "strategy_instances"`);
        await queryRunner.query(
          `ALTER TABLE "temporary_strategy_instances" RENAME TO "strategy_instances"`,
        );
      }
    }
  }
}
