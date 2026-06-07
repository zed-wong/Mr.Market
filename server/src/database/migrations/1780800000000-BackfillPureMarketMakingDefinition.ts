import { MigrationInterface, QueryRunner } from 'typeorm';

import pureMarketMakingSeedDefinition from '../seeder/data/strategies/pure-market-making.json';

type SeededStrategyDefinitionConfig = {
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
};

const PURE_MARKET_MAKING_DEFINITION_KEY = 'pure_market_making';
const PURE_MARKET_MAKING_CONTROLLER_TYPE = 'pureMarketMaking';
const PURE_MARKET_MAKING_SEED =
  pureMarketMakingSeedDefinition as SeededStrategyDefinitionConfig;
const PURE_MARKET_MAKING_CAPABILITIES = {
  launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
  directExecutionMode: 'single_account',
};

export class BackfillPureMarketMakingDefinition1780800000000 implements MigrationInterface {
  name = 'BackfillPureMarketMakingDefinition1780800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasStrategyDefinitionsTable(queryRunner))) {
      return;
    }

    const existing = await this.findExistingPureDefinition(queryRunner);
    const nowExpression = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
    const capabilities =
      PURE_MARKET_MAKING_SEED.capabilities || PURE_MARKET_MAKING_CAPABILITIES;

    if (existing) {
      await queryRunner.query(
        `UPDATE "strategy_definitions"
         SET "name" = ?,
             "description" = ?,
             "controllerType" = ?,
             "configSchema" = ?,
             "defaultConfig" = ?,
             "capabilities" = ?,
             "enabled" = 1,
             "visibility" = 'public',
             "updatedAt" = ${nowExpression}
         WHERE "id" = ?`,
        [
          'Pure Market Making',
          'Place buy and sell orders on both sides of the order book',
          PURE_MARKET_MAKING_CONTROLLER_TYPE,
          JSON.stringify(PURE_MARKET_MAKING_SEED.configSchema),
          JSON.stringify(PURE_MARKET_MAKING_SEED.defaultConfig),
          JSON.stringify(capabilities),
          existing.id,
        ],
      );
      return;
    }

    await queryRunner.query(
      `INSERT INTO "strategy_definitions" (
        "id",
        "key",
        "name",
        "description",
        "controllerType",
        "configSchema",
        "defaultConfig",
        "capabilities",
        "enabled",
        "visibility",
        "createdBy",
        "createdAt",
        "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'public', ?, ${nowExpression}, ${nowExpression})`,
      [
        'strategy-pure-market-making',
        PURE_MARKET_MAKING_DEFINITION_KEY,
        'Pure Market Making',
        'Place buy and sell orders on both sides of the order book',
        PURE_MARKET_MAKING_CONTROLLER_TYPE,
        JSON.stringify(PURE_MARKET_MAKING_SEED.configSchema),
        JSON.stringify(PURE_MARKET_MAKING_SEED.defaultConfig),
        JSON.stringify(capabilities),
        'migration:1780800000000',
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasStrategyDefinitionsTable(queryRunner))) {
      return;
    }

    await queryRunner.query(
      `DELETE FROM "strategy_definitions"
       WHERE "key" = ? AND "createdBy" = ?`,
      [PURE_MARKET_MAKING_DEFINITION_KEY, 'migration:1780800000000'],
    );
  }

  private async hasStrategyDefinitionsTable(
    queryRunner: QueryRunner,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'strategy_definitions'`,
    );

    return rows.length > 0;
  }

  private async findExistingPureDefinition(
    queryRunner: QueryRunner,
  ): Promise<{ id: string } | null> {
    const rows: Array<{ id: string }> = await queryRunner.query(
      `SELECT "id" FROM "strategy_definitions"
       WHERE "controllerType" = ?
          OR "key" IN (?, ?, ?, ?)
       LIMIT 1`,
      [
        PURE_MARKET_MAKING_CONTROLLER_TYPE,
        PURE_MARKET_MAKING_DEFINITION_KEY,
        'pure-market-making',
        'market_making',
        'market-making',
      ],
    );

    return rows[0] || null;
  }
}
