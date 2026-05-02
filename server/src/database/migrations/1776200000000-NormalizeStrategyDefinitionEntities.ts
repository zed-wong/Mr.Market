import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeStrategyDefinitionEntities1776200000000
  implements MigrationInterface
{
  name = 'NormalizeStrategyDefinitionEntities1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.rebuildStrategyDefinitions(queryRunner, 'up');
    await this.rebuildStrategyInstances(queryRunner, 'up');
    await this.rebuildStrategyOrderIntent(queryRunner, 'up');
    await this.ensureMarketMakingOrderIntentSnapshot(queryRunner);
    await this.rebuildStrategyExecutionHistory(queryRunner, 'up');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.rebuildStrategyExecutionHistory(queryRunner, 'down');
    await this.dropMarketMakingOrderIntentSnapshot(queryRunner);
    await this.rebuildStrategyOrderIntent(queryRunner, 'down');
    await this.rebuildStrategyInstances(queryRunner, 'down');
    await this.rebuildStrategyDefinitions(queryRunner, 'down');
  }

  private async tableExists(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<boolean> {
    const rows: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName],
    );

    return rows.length > 0;
  }

  private async hasColumn(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    if (!(await this.tableExists(queryRunner, tableName))) {
      return false;
    }

    const columns: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("${tableName}")`,
    );

    return columns.some((column) => column.name === columnName);
  }

  private async rebuildStrategyDefinitions(
    queryRunner: QueryRunner,
    direction: 'up' | 'down',
  ): Promise<void> {
    if (!(await this.tableExists(queryRunner, 'strategy_definitions'))) {
      return;
    }

    const sourceControllerColumn =
      direction === 'up'
        ? (await this.hasColumn(
            queryRunner,
            'strategy_definitions',
            'controllerType',
          ))
          ? '"controllerType"'
          : '"executorType"'
        : (await this.hasColumn(
            queryRunner,
            'strategy_definitions',
            'executorType',
          ))
        ? '"executorType"'
        : '"controllerType"';
    const targetControllerColumn =
      direction === 'up' ? 'controllerType' : 'executorType';
    const hasCapabilities = await this.hasColumn(
      queryRunner,
      'strategy_definitions',
      'capabilities',
    );
    const computedCapabilities = `CASE
      WHEN json_valid("configSchema")
        AND (
          json_type("configSchema", '$.launchSurfaces') IS NOT NULL
          OR json_type("configSchema", '$.directExecutionMode') IS NOT NULL
        )
      THEN json_object(
        'launchSurfaces',
        COALESCE(json(json_extract("configSchema", '$.launchSurfaces')), json('[]')),
        'directExecutionMode',
        json_extract("configSchema", '$.directExecutionMode')
      )
      ELSE NULL
    END`;
    const configSchemaSelect =
      direction === 'up'
        ? `CASE
            WHEN json_valid("configSchema")
            THEN json_remove("configSchema", '$.launchSurfaces', '$.directExecutionMode')
            ELSE "configSchema"
          END`
        : '"configSchema"';
    const capabilitiesSelect =
      direction === 'up'
        ? hasCapabilities
          ? `COALESCE("capabilities", ${computedCapabilities})`
          : computedCapabilities
        : 'NULL';

    await queryRunner.query(
      `CREATE TABLE "temporary_strategy_definitions" (
        "id" varchar PRIMARY KEY NOT NULL,
        "key" varchar NOT NULL,
        "name" varchar NOT NULL,
        "description" varchar,
        "${targetControllerColumn}" varchar NOT NULL,
        "configSchema" text NOT NULL,
        "defaultConfig" text NOT NULL,
        ${
          direction === 'up'
            ? '"capabilities" text,'
            : ''
        }
        "enabled" boolean NOT NULL DEFAULT (1),
        "visibility" varchar NOT NULL DEFAULT ('admin'),
        "createdBy" varchar,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL
      )`,
    );

    await queryRunner.query(
      `INSERT INTO "temporary_strategy_definitions" (
        "id",
        "key",
        "name",
        "description",
        "${targetControllerColumn}",
        "configSchema",
        "defaultConfig",
        ${
          direction === 'up'
            ? '"capabilities",'
            : ''
        }
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
        ${sourceControllerColumn},
        ${configSchemaSelect},
        "defaultConfig",
        ${
          direction === 'up'
            ? `${capabilitiesSelect},`
            : ''
        }
        "enabled",
        CASE WHEN "visibility" = 'public' THEN 'public' ELSE 'admin' END,
        "createdBy",
        COALESCE("createdAt", strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        COALESCE("updatedAt", strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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

  private async rebuildStrategyInstances(
    queryRunner: QueryRunner,
    direction: 'up' | 'down',
  ): Promise<void> {
    if (!(await this.tableExists(queryRunner, 'strategy_instances'))) {
      return;
    }

    const sourceDefinitionColumn =
      direction === 'up'
        ? (await this.hasColumn(
            queryRunner,
            'strategy_instances',
            'strategyDefinitionId',
          ))
          ? '"strategyDefinitionId"'
          : '"definitionId"'
        : (await this.hasColumn(
            queryRunner,
            'strategy_instances',
            'definitionId',
          ))
        ? '"definitionId"'
        : '"strategyDefinitionId"';
    const targetDefinitionColumn =
      direction === 'up' ? 'strategyDefinitionId' : 'definitionId';

    await queryRunner.query(
      `CREATE TABLE "temporary_strategy_instances" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "strategyKey" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "clientId" varchar NOT NULL,
        "strategyType" varchar NOT NULL,
        "${targetDefinitionColumn}" varchar,
        "marketMakingOrderId" varchar,
        "startPrice" integer NOT NULL,
        "parameters" json NOT NULL,
        "status" varchar NOT NULL,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL
      )`,
    );

    await queryRunner.query(
      `INSERT INTO "temporary_strategy_instances" (
        "id",
        "strategyKey",
        "userId",
        "clientId",
        "strategyType",
        "${targetDefinitionColumn}",
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
        ${sourceDefinitionColumn},
        "marketMakingOrderId",
        "startPrice",
        "parameters",
        "status",
        COALESCE("createdAt", strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        COALESCE("updatedAt", strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      FROM "strategy_instances"`,
    );

    await queryRunner.query(`DROP TABLE "strategy_instances"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_strategy_instances" RENAME TO "strategy_instances"`,
    );

    if (direction === 'up') {
      await queryRunner.query(
        `CREATE INDEX "IDX_strategy_instances_strategy_definition_id" ON "strategy_instances" ("strategyDefinitionId")`,
      );
    }
  }

  private async rebuildStrategyOrderIntent(
    queryRunner: QueryRunner,
    direction: 'up' | 'down',
  ): Promise<void> {
    if (!(await this.tableExists(queryRunner, 'strategy_order_intent'))) {
      return;
    }

    const sourceRuntimeColumn =
      direction === 'up'
        ? (await this.hasColumn(
            queryRunner,
            'strategy_order_intent',
            'runtimeInstanceKey',
          ))
          ? '"runtimeInstanceKey"'
          : '"strategyInstanceId"'
        : (await this.hasColumn(
            queryRunner,
            'strategy_order_intent',
            'strategyInstanceId',
          ))
        ? '"strategyInstanceId"'
        : '"runtimeInstanceKey"';
    const targetRuntimeColumn =
      direction === 'up' ? 'runtimeInstanceKey' : 'strategyInstanceId';

    await queryRunner.query(
      `CREATE TABLE "temporary_strategy_order_intent" (
        "intentId" varchar PRIMARY KEY NOT NULL,
        "${targetRuntimeColumn}" varchar NOT NULL,
        "strategyKey" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "clientId" varchar NOT NULL,
        "type" varchar NOT NULL,
        "exchange" varchar NOT NULL,
        "accountLabel" varchar,
        "pair" varchar NOT NULL,
        "side" varchar NOT NULL,
        "price" varchar NOT NULL,
        "qty" varchar NOT NULL,
        "mixinOrderId" varchar,
        "executionCategory" varchar,
        "postOnly" boolean,
        "timeInForce" varchar,
        "slotKey" varchar,
        "metadata" text,
        "status" varchar NOT NULL,
        "errorReason" varchar,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL
      )`,
    );

    await queryRunner.query(
      `INSERT INTO "temporary_strategy_order_intent" (
        "intentId",
        "${targetRuntimeColumn}",
        "strategyKey",
        "userId",
        "clientId",
        "type",
        "exchange",
        "accountLabel",
        "pair",
        "side",
        "price",
        "qty",
        "mixinOrderId",
        "executionCategory",
        "postOnly",
        "timeInForce",
        "slotKey",
        "metadata",
        "status",
        "errorReason",
        "createdAt",
        "updatedAt"
      )
      SELECT
        "intentId",
        ${sourceRuntimeColumn},
        "strategyKey",
        "userId",
        "clientId",
        "type",
        "exchange",
        ${await this.hasColumn(queryRunner, 'strategy_order_intent', 'accountLabel') ? '"accountLabel"' : 'NULL'},
        "pair",
        "side",
        "price",
        "qty",
        "mixinOrderId",
        ${await this.hasColumn(queryRunner, 'strategy_order_intent', 'executionCategory') ? '"executionCategory"' : 'NULL'},
        ${await this.hasColumn(queryRunner, 'strategy_order_intent', 'postOnly') ? '"postOnly"' : 'NULL'},
        ${await this.hasColumn(queryRunner, 'strategy_order_intent', 'timeInForce') ? '"timeInForce"' : 'NULL'},
        ${await this.hasColumn(queryRunner, 'strategy_order_intent', 'slotKey') ? '"slotKey"' : 'NULL'},
        ${await this.hasColumn(queryRunner, 'strategy_order_intent', 'metadata') ? '"metadata"' : 'NULL'},
        "status",
        "errorReason",
        "createdAt",
        "updatedAt"
      FROM "strategy_order_intent"`,
    );

    await queryRunner.query(`DROP TABLE "strategy_order_intent"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_strategy_order_intent" RENAME TO "strategy_order_intent"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_order_intent_strategy_key" ON "strategy_order_intent" ("strategyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_order_intent_status" ON "strategy_order_intent" ("status")`,
    );
  }

  private async ensureMarketMakingOrderIntentSnapshot(
    queryRunner: QueryRunner,
  ): Promise<void> {
    if (
      (await this.tableExists(queryRunner, 'market_making_order_intent')) &&
      !(await this.hasColumn(
        queryRunner,
        'market_making_order_intent',
        'strategySnapshot',
      ))
    ) {
      await queryRunner.query(
        `ALTER TABLE "market_making_order_intent" ADD "strategySnapshot" text`,
      );
    }
  }

  private async dropMarketMakingOrderIntentSnapshot(
    queryRunner: QueryRunner,
  ): Promise<void> {
    if (
      !(await this.tableExists(queryRunner, 'market_making_order_intent')) ||
      !(await this.hasColumn(
        queryRunner,
        'market_making_order_intent',
        'strategySnapshot',
      ))
    ) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE "temporary_market_making_order_intent" (
        "orderId" varchar PRIMARY KEY NOT NULL,
        "userId" varchar,
        "marketMakingPairId" varchar NOT NULL,
        "strategyDefinitionId" varchar,
        "configOverrides" text,
        "state" varchar NOT NULL DEFAULT ('pending'),
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL,
        "expiresAt" varchar NOT NULL
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_market_making_order_intent" (
        "orderId",
        "userId",
        "marketMakingPairId",
        "strategyDefinitionId",
        "configOverrides",
        "state",
        "createdAt",
        "updatedAt",
        "expiresAt"
      )
      SELECT
        "orderId",
        "userId",
        "marketMakingPairId",
        "strategyDefinitionId",
        "configOverrides",
        "state",
        "createdAt",
        "updatedAt",
        "expiresAt"
      FROM "market_making_order_intent"`,
    );
    await queryRunner.query(`DROP TABLE "market_making_order_intent"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_market_making_order_intent" RENAME TO "market_making_order_intent"`,
    );
  }

  private async rebuildStrategyExecutionHistory(
    queryRunner: QueryRunner,
    direction: 'up' | 'down',
  ): Promise<void> {
    if (!(await this.tableExists(queryRunner, 'strategy_execution_history'))) {
      return;
    }

    const sourceRuntimeColumn =
      direction === 'up'
        ? (await this.hasColumn(
            queryRunner,
            'strategy_execution_history',
            'runtimeInstanceKey',
          ))
          ? '"runtimeInstanceKey"'
          : '"strategyInstanceId"'
        : (await this.hasColumn(
            queryRunner,
            'strategy_execution_history',
            'strategyInstanceId',
          ))
        ? '"strategyInstanceId"'
        : '"runtimeInstanceKey"';
    const targetRuntimeColumn =
      direction === 'up' ? 'runtimeInstanceKey' : 'strategyInstanceId';

    await queryRunner.query(
      `CREATE TABLE "temporary_strategy_execution_history" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "clientId" varchar,
        "exchange" varchar NOT NULL,
        "pair" varchar NOT NULL,
        "side" varchar CHECK( "side" IN ('buy','sell') ),
        "amount" text,
        "price" text,
        "strategyType" varchar NOT NULL,
        "${targetRuntimeColumn}" varchar,
        "orderId" varchar,
        "status" varchar,
        "metadata" text,
        "executedAt" ${direction === 'up' ? 'varchar' : 'datetime'} NOT NULL
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_strategy_execution_history" (
        "id",
        "userId",
        "clientId",
        "exchange",
        "pair",
        "side",
        "amount",
        "price",
        "strategyType",
        "${targetRuntimeColumn}",
        "orderId",
        "status",
        "metadata",
        "executedAt"
      )
      SELECT
        "id",
        "userId",
        "clientId",
        "exchange",
        "pair",
        "side",
        "amount",
        "price",
        "strategyType",
        ${sourceRuntimeColumn},
        "orderId",
        "status",
        "metadata",
        COALESCE("executedAt", strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      FROM "strategy_execution_history"`,
    );
    await queryRunner.query(`DROP TABLE "strategy_execution_history"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_strategy_execution_history" RENAME TO "strategy_execution_history"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_execution_history_user" ON "strategy_execution_history" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_execution_history_executed_at" ON "strategy_execution_history" ("executedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_execution_history_type" ON "strategy_execution_history" ("strategyType")`,
    );
  }
}
