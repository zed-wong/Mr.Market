import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStrategyDefinitions1771400000000 implements MigrationInterface {
  name = 'AddStrategyDefinitions1771400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "strategy_definitions" ("id" varchar PRIMARY KEY NOT NULL, "key" varchar NOT NULL, "name" varchar NOT NULL, "description" varchar, "executorType" varchar NOT NULL, "configSchema" text NOT NULL, "defaultConfig" text NOT NULL, "enabled" boolean NOT NULL DEFAULT (1), "visibility" varchar NOT NULL DEFAULT ('system'), "createdBy" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))` ,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_strategy_definitions_key" ON "strategy_definitions" ("key")`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy_instances" ADD "definitionId" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy_instances" ADD "definitionVersion" varchar DEFAULT ('1.0.0')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_strategy_instances" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "strategyKey" varchar NOT NULL, "userId" varchar NOT NULL, "clientId" varchar NOT NULL, "strategyType" varchar NOT NULL, "startPrice" integer NOT NULL, "parameters" json NOT NULL, "status" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))` ,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_strategy_instances"("id", "strategyKey", "userId", "clientId", "strategyType", "startPrice", "parameters", "status", "createdAt", "updatedAt") SELECT "id", "strategyKey", "userId", "clientId", "strategyType", "startPrice", "parameters", "status", "createdAt", "updatedAt" FROM "strategy_instances"`,
    );
    await queryRunner.query(`DROP TABLE "strategy_instances"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_strategy_instances" RENAME TO "strategy_instances"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_strategy_definitions_key"`);
    await queryRunner.query(`DROP TABLE "strategy_definitions"`);
  }
}
