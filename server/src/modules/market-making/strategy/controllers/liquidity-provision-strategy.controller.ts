import { Injectable } from '@nestjs/common';

import { ExecutorAction } from '../config/executor-action.types';
import type {
  StrategyController,
  StrategyControllerFacade,
  StrategyTickContext,
} from '../config/strategy-controller.types';

@Injectable()
export class LiquidityProvisionStrategyController implements StrategyController {
  readonly strategyType = 'liquidityProvision' as const;

  getCadenceMs(parameters: Record<string, unknown>): number {
    const cadenceMs = Number(parameters.cadenceMs || parameters.intervalMs || 30_000);

    return Number.isFinite(cadenceMs) && cadenceMs > 0 ? cadenceMs : 30_000;
  }

  async rerun(): Promise<void> {
    return;
  }

  async start(
    _config: Record<string, unknown>,
    _service: StrategyControllerFacade,
  ): Promise<void> {
    return;
  }

  async decideActions(ctx: StrategyTickContext): Promise<ExecutorAction[]> {
    const params = ctx.session.params;
    const positionStatus = String(params.positionStatus || 'none');
    const baseMetadata = {
      connectorId: params.connectorId,
      chainId: params.chainId,
      tradingAccountId: params.tradingAccountId,
      ledgerOrderId: params.ledgerOrderId,
      userOrderId: ctx.session.clientId,
      gasSponsorLedgerOrderId: params.gasSponsorLedgerOrderId,
      token0: params.token0,
      token1: params.token1,
      feeTier: params.feeTier,
      poolAddress: params.poolAddress,
      positionId: params.positionId,
      positionTokenId: params.positionTokenId,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
    };

    if (positionStatus === 'none') {
      return [
        this.buildLpIntent(ctx, 'ADD_LIQUIDITY', {
          ...baseMetadata,
          amount0Desired: params.amount0Desired,
          amount1Desired: params.amount1Desired,
        }),
      ];
    }

    if (positionStatus === 'out_of_range') {
      return [
        this.buildLpIntent(ctx, 'REMOVE_LIQUIDITY', baseMetadata),
        this.buildLpIntent(ctx, 'ADD_LIQUIDITY', {
          ...baseMetadata,
          amount0Desired: params.amount0Desired,
          amount1Desired: params.amount1Desired,
        }),
      ];
    }

    if (Number(params.uncollectedFeeValue || 0) >= Number(params.feeThreshold || 0)) {
      return [this.buildLpIntent(ctx, 'COLLECT_FEES', baseMetadata)];
    }

    return [];
  }

  private buildLpIntent(
    ctx: StrategyTickContext,
    type: 'ADD_LIQUIDITY' | 'REMOVE_LIQUIDITY' | 'COLLECT_FEES',
    metadata: Record<string, unknown>,
  ): ExecutorAction {
    return {
      type,
      intentId: `${ctx.session.strategyKey}:${ctx.ts}:${type.toLowerCase()}`,
      runtimeInstanceKey: ctx.session.strategyKey,
      strategyKey: ctx.session.strategyKey,
      userId: ctx.session.userId,
      clientId: ctx.session.clientId,
      exchange: String(metadata.connectorId || ''),
      connectorId: String(metadata.connectorId || ''),
      pair: String(ctx.session.params.symbol || ''),
      side: 'buy',
      price: '0',
      qty: '0',
      executionCategory: 'amm',
      metadata,
      createdAt: ctx.ts,
      status: 'NEW',
    };
  }
}
