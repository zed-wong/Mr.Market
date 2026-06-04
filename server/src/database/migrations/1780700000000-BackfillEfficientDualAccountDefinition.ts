import { MigrationInterface, QueryRunner } from 'typeorm';

const EFFICIENT_DUAL_ACCOUNT_DEFINITION_KEY =
  'efficient_dual_account_volume';
const EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE = 'efficientDualAccountVolume';
const EFFICIENT_DUAL_ACCOUNT_CAPABILITIES = {
  launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
  directExecutionMode: 'dual_account',
};
const EFFICIENT_DUAL_ACCOUNT_CONFIG_SCHEMA = {
  type: 'object',
  required: ['symbol', 'maxOrderAmount'],
  properties: {
    symbol: {
      type: 'string',
      description: 'Trading pair symbol (e.g. BTC/USDT)',
    },
    maxOrderAmount: {
      type: 'number',
      description:
        'Maximum base amount to trade per cycle; live balance/capacity can reduce the executed amount',
      minimum: 0,
    },
    mode: {
      type: 'string',
      enum: ['cheapest_capital', 'balanced', 'fastest_volume'],
      description: 'Capital/volume tradeoff mode. Defaults to balanced.',
    },
    interval: {
      type: 'number',
      description: 'Optional seconds between execution cycles',
      minimum: 1,
    },
    dailyVolumeTarget: {
      type: 'number',
      description: 'Optional quote-volume cap for the session',
      minimum: 0,
    },
    tradeAmountVariance: {
      type: 'number',
      description: 'Fractional variance applied to selected cycle quantity',
      minimum: 0,
    },
    priceOffsetVariance: {
      type: 'number',
      description: 'Fractional variance applied to maker price offset',
      minimum: 0,
    },
    cycleMode: {
      type: 'string',
      enum: ['alternating', 'static'],
      description: 'Cycle role mode. Unified direct orders default to alternating.',
    },
    dynamicRoleSwitching: {
      type: 'boolean',
      description:
        'Switch maker/taker roles dynamically based on balances. Unified direct orders default to true.',
    },
    strategyContract: {
      type: 'string',
      enum: ['efficientDualAccountVolume'],
      description:
        'Unified Efficient Dual Account Volume backend contract marker',
    },
    safetyBuffer: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['default_formula'] },
        exchangeCostMinMultiplier: { type: 'number', minimum: 0 },
        feeCostMultiplier: { type: 'number', minimum: 0 },
      },
      additionalProperties: false,
    },
    makerAccountLabel: {
      type: 'string',
      description: 'Maker account label injected by admin direct start',
    },
    takerAccountLabel: {
      type: 'string',
      description: 'Taker account label injected by admin direct start',
    },
    pair: {
      type: 'string',
      description: 'Pair alias injected by admin direct start',
    },
    exchangeName: {
      type: 'string',
      description: 'Exchange injected by admin direct start',
    },
    userId: {
      type: 'string',
      description: 'Runtime user id injected by admin direct start',
    },
    clientId: {
      type: 'string',
      description: 'Runtime client/order id injected by admin direct start',
    },
    marketMakingOrderId: {
      type: 'string',
      description: 'Runtime market-making order id injected by admin direct start',
    },
  },
  additionalProperties: false,
};
const EFFICIENT_DUAL_ACCOUNT_DEFAULT_CONFIG = {
  symbol: 'BTC/USDT',
  maxOrderAmount: 0.1,
  interval: 30,
  mode: 'balanced',
  cycleMode: 'alternating',
  dynamicRoleSwitching: true,
  strategyContract: 'efficientDualAccountVolume',
  safetyBuffer: {
    kind: 'default_formula',
    exchangeCostMinMultiplier: 0.5,
    feeCostMultiplier: 2,
  },
};

export class BackfillEfficientDualAccountDefinition1780700000000
  implements MigrationInterface
{
  name = 'BackfillEfficientDualAccountDefinition1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasStrategyDefinitionsTable(queryRunner))) {
      return;
    }

    const existing = await this.findExistingEfficientDefinition(queryRunner);
    const nowExpression = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

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
             "visibility" = 'admin',
             "updatedAt" = ${nowExpression}
         WHERE "id" = ?`,
        [
          'Efficient Dual Account Volume',
          'Generate capital-efficient paired maker/taker volume using one unified dual-account contract',
          EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE,
          JSON.stringify(EFFICIENT_DUAL_ACCOUNT_CONFIG_SCHEMA),
          JSON.stringify(EFFICIENT_DUAL_ACCOUNT_DEFAULT_CONFIG),
          JSON.stringify(EFFICIENT_DUAL_ACCOUNT_CAPABILITIES),
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'admin', ?, ${nowExpression}, ${nowExpression})`,
      [
        'strategy-efficient-dual-account-volume',
        EFFICIENT_DUAL_ACCOUNT_DEFINITION_KEY,
        'Efficient Dual Account Volume',
        'Generate capital-efficient paired maker/taker volume using one unified dual-account contract',
        EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE,
        JSON.stringify(EFFICIENT_DUAL_ACCOUNT_CONFIG_SCHEMA),
        JSON.stringify(EFFICIENT_DUAL_ACCOUNT_DEFAULT_CONFIG),
        JSON.stringify(EFFICIENT_DUAL_ACCOUNT_CAPABILITIES),
        'migration:1780700000000',
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
      [EFFICIENT_DUAL_ACCOUNT_DEFINITION_KEY, 'migration:1780700000000'],
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

  private async findExistingEfficientDefinition(
    queryRunner: QueryRunner,
  ): Promise<{ id: string } | null> {
    const rows: Array<{ id: string }> = await queryRunner.query(
      `SELECT "id" FROM "strategy_definitions"
       WHERE "controllerType" = ?
          OR "key" IN (?, ?)
       LIMIT 1`,
      [
        EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE,
        EFFICIENT_DUAL_ACCOUNT_DEFINITION_KEY,
        'efficient-dual-account-volume',
      ],
    );

    return rows[0] || null;
  }
}
