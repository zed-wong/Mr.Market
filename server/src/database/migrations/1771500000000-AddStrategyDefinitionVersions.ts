import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStrategyDefinitionVersions1771500000000
  implements MigrationInterface
{
  name = 'AddStrategyDefinitionVersions1771500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "strategy_definitions" ADD "currentVersion" varchar NOT NULL DEFAULT ('1.0.0')`,
    );
    await queryRunner.query(
      `CREATE TABLE "strategy_definition_versions" ("id" varchar PRIMARY KEY NOT NULL, "definitionId" varchar NOT NULL, "version" varchar NOT NULL, "executorType" varchar NOT NULL, "configSchema" text NOT NULL, "defaultConfig" text NOT NULL, "description" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))` ,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_strategy_definition_versions_definition_id_version" ON "strategy_definition_versions" ("definitionId", "version")`,
    );

    await queryRunner.query(
      `INSERT INTO "strategy_definition_versions" ("id", "definitionId", "version", "executorType", "configSchema", "defaultConfig", "description") SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + abs(random()) % 4, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), "id", "currentVersion", "executorType", "configSchema", "defaultConfig", "description" FROM "strategy_definitions"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_strategy_definition_versions_definition_id_version"`,
    );
    await queryRunner.query(`DROP TABLE "strategy_definition_versions"`);

    await queryRunner.query(
      `CREATE TABLE "temporary_strategy_definitions" ("id" varchar PRIMARY KEY NOT NULL, "key" varchar NOT NULL, "name" varchar NOT NULL, "description" varchar, "executorType" varchar NOT NULL, "configSchema" text NOT NULL, "defaultConfig" text NOT NULL, "enabled" boolean NOT NULL DEFAULT (1), "visibility" varchar NOT NULL DEFAULT ('system'), "createdBy" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))` ,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_strategy_definitions"("id", "key", "name", "description", "executorType", "configSchema", "defaultConfig", "enabled", "visibility", "createdBy", "createdAt", "updatedAt") SELECT "id", "key", "name", "description", "executorType", "configSchema", "defaultConfig", "enabled", "visibility", "createdBy", "createdAt", "updatedAt" FROM "strategy_definitions"`,
    );
    await queryRunner.query(`DROP TABLE "strategy_definitions"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_strategy_definitions" RENAME TO "strategy_definitions"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_strategy_definitions_key" ON "strategy_definitions" ("key")`,
    );
  }
}
