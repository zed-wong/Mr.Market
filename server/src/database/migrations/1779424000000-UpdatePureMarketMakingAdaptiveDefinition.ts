import { MigrationInterface, QueryRunner } from 'typeorm';

const ADAPTIVE_SCHEMA_PROPERTIES: Record<string, Record<string, unknown>> = {
  volBasedSpread: { type: 'boolean' },
  sigmaWindowMs: { type: 'number', minimum: 0 },
  spreadSigmaMultiplier: { type: 'number', minimum: 0 },
  maxAdaptiveSpread: { type: 'number', minimum: 0 },
  volatilitySampleMinCount: { type: 'number', minimum: 0 },
  imbalanceSkewFactor: { type: 'number', minimum: 0 },
  imbalanceDepthLevels: { type: 'number', minimum: 1 },
  imbalanceMinDepthNotional: { type: 'number', minimum: 0 },
  imbalanceSmoothingMs: { type: 'number', minimum: 0 },
  inventorySeverePivot: { type: 'number', minimum: 0 },
  inventoryPauseSidePivot: { type: 'number', minimum: 0 },
  adaptiveSizeEnabled: { type: 'boolean' },
  sizeVolScalingFactor: { type: 'number', minimum: 0 },
  sizeFloor: { type: 'number', minimum: 0 },
  maxLayersInVol: { type: 'number', minimum: 0 },
  layeringMinBudgetMultiple: { type: 'number', minimum: 0 },
  adaptiveRefreshEnabled: { type: 'boolean' },
  refreshMinMs: { type: 'number', minimum: 1000 },
  refreshMaxMs: { type: 'number', minimum: 1000 },
  refreshVolPivot: { type: 'number', minimum: 0 },
  cancelBudgetPerSec: { type: 'number', minimum: 0 },
  runtimeObservationWindowMs: { type: 'number', minimum: 0 },
  postOnlyRejectThreshold: { type: 'number', minimum: 0 },
  postOnlyRejectWidenBps: { type: 'number', minimum: 0 },
  rateLimitPressureThreshold: { type: 'number', minimum: 0 },
  staleSoftMs: { type: 'number', minimum: 0 },
  staleHardMs: { type: 'number', minimum: 0 },
  marketCrashWindowMs: { type: 'number', minimum: 0 },
  marketCrashBps: { type: 'number', minimum: 0 },
  adverseMarkoutGuardBps: { type: 'number', minimum: 0 },
  adverseMarkoutWindowMs: { type: 'number', minimum: 0 },
  adverseMarkoutCooldownMs: { type: 'number', minimum: 0 },
  adverseMarkoutRecoveryMs: { type: 'number', minimum: 0 },
  adverseMarkoutRecoverySizeRatio: { type: 'number', minimum: 0 },
  warmupMs: { type: 'number', minimum: 0 },
  warmupTicks: { type: 'number', minimum: 0 },
  warmupSpread: { type: 'number', minimum: 0 },
  warmupSizeRatio: { type: 'number', minimum: 0 },
};

const ADAPTIVE_DEFAULT_CONFIG: Record<string, unknown> = {
  volBasedSpread: false,
  sigmaWindowMs: 60000,
  spreadSigmaMultiplier: 1,
  maxAdaptiveSpread: 0,
  volatilitySampleMinCount: 3,
  imbalanceSkewFactor: 0,
  imbalanceDepthLevels: 3,
  imbalanceMinDepthNotional: 0,
  imbalanceSmoothingMs: 0,
  inventorySeverePivot: 0,
  inventoryPauseSidePivot: 0,
  adaptiveSizeEnabled: false,
  sizeVolScalingFactor: 0,
  sizeFloor: 0.2,
  maxLayersInVol: 0,
  layeringMinBudgetMultiple: 10,
  adaptiveRefreshEnabled: false,
  refreshMinMs: 1000,
  refreshMaxMs: 10000,
  refreshVolPivot: 0.01,
  cancelBudgetPerSec: 0,
  runtimeObservationWindowMs: 60000,
  postOnlyRejectThreshold: 0,
  postOnlyRejectWidenBps: 0,
  rateLimitPressureThreshold: 0,
  staleSoftMs: 2000,
  staleHardMs: 10000,
  marketCrashWindowMs: 60000,
  marketCrashBps: 0,
  adverseMarkoutGuardBps: 0,
  adverseMarkoutWindowMs: 0,
  adverseMarkoutCooldownMs: 0,
  adverseMarkoutRecoveryMs: 0,
  adverseMarkoutRecoverySizeRatio: 0.5,
  warmupMs: 0,
  warmupTicks: 0,
  warmupSpread: 0,
  warmupSizeRatio: 0.2,
};

const PRICE_SOURCE_ENUM_WITH_MICROPRICE = [
  'MID_PRICE',
  'MICROPRICE',
  'BEST_BID',
  'BEST_ASK',
  'LAST_PRICE',
];

const PRICE_SOURCE_ENUM_WITHOUT_MICROPRICE = [
  'MID_PRICE',
  'BEST_BID',
  'BEST_ASK',
  'LAST_PRICE',
];

export class UpdatePureMarketMakingAdaptiveDefinition1779424000000
  implements MigrationInterface
{
  name = 'UpdatePureMarketMakingAdaptiveDefinition1779424000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasStrategyDefinitionsTable(queryRunner))) {
      return;
    }

    await queryRunner.query(
      `UPDATE "strategy_definitions"
       SET "capabilities" = ?
       WHERE "key" = 'pure_market_making'`,
      [
        JSON.stringify({
          launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
          directExecutionMode: 'single_account',
        }),
      ],
    );

    await this.setJsonValue(
      queryRunner,
      'configSchema',
      '$.properties.priceSourceType.enum',
      PRICE_SOURCE_ENUM_WITH_MICROPRICE,
    );

    for (const [key, value] of Object.entries(ADAPTIVE_SCHEMA_PROPERTIES)) {
      await this.setJsonValue(
        queryRunner,
        'configSchema',
        `$.properties.${key}`,
        value,
      );
    }

    for (const [key, value] of Object.entries(ADAPTIVE_DEFAULT_CONFIG)) {
      await this.setJsonValue(queryRunner, 'defaultConfig', `$.${key}`, value);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasStrategyDefinitionsTable(queryRunner))) {
      return;
    }

    await this.setJsonValue(
      queryRunner,
      'configSchema',
      '$.properties.priceSourceType.enum',
      PRICE_SOURCE_ENUM_WITHOUT_MICROPRICE,
    );

    for (const key of Object.keys(ADAPTIVE_SCHEMA_PROPERTIES)) {
      await this.removeJsonPath(
        queryRunner,
        'configSchema',
        `$.properties.${key}`,
      );
    }

    for (const key of Object.keys(ADAPTIVE_DEFAULT_CONFIG)) {
      await this.removeJsonPath(queryRunner, 'defaultConfig', `$.${key}`);
    }
  }

  private async hasStrategyDefinitionsTable(
    queryRunner: QueryRunner,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'strategy_definitions'`,
    );

    return rows.length > 0;
  }

  private async setJsonValue(
    queryRunner: QueryRunner,
    column: 'configSchema' | 'defaultConfig',
    path: string,
    value: unknown,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE "strategy_definitions"
       SET "${column}" = json_set("${column}", ?, json(?))
       WHERE "key" = 'pure_market_making' AND json_valid("${column}")`,
      [path, JSON.stringify(value)],
    );
  }

  private async removeJsonPath(
    queryRunner: QueryRunner,
    column: 'configSchema' | 'defaultConfig',
    path: string,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE "strategy_definitions"
       SET "${column}" = json_remove("${column}", ?)
       WHERE "key" = 'pure_market_making' AND json_valid("${column}")`,
      [path],
    );
  }
}
