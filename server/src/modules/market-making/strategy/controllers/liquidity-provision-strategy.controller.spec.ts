import { LiquidityProvisionStrategyController } from './liquidity-provision-strategy.controller';

describe('LiquidityProvisionStrategyController', () => {
  it('emits ADD_LIQUIDITY when no LP position is active', async () => {
    const controller = new LiquidityProvisionStrategyController();

    const actions = await controller.decideActions({
      ts: '2026-06-22T00:00:00.000Z',
      session: {
        runId: 'run-1',
        strategyKey: 'strategy-1',
        strategyType: 'liquidityProvision',
        userId: 'user-1',
        clientId: 'order-1',
        cadenceMs: 30_000,
        nextRunAtMs: 0,
        params: {
          positionStatus: 'none',
          connectorId: 'uniswapV3',
          chainId: 1,
          tradingAccountId: 'account-1',
          ledgerOrderId: 'ledger-order-1',
          token0: '0xtoken0',
          token1: '0xtoken1',
          amount0Desired: '10',
          amount1Desired: '20',
        },
      },
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      type: 'ADD_LIQUIDITY',
      connectorId: 'uniswapV3',
      executionCategory: 'amm',
      metadata: expect.objectContaining({
        ledgerOrderId: 'ledger-order-1',
        amount0Desired: '10',
      }),
    });
  });

  it('emits rebalance and collect intents from cached LP state inputs', async () => {
    const controller = new LiquidityProvisionStrategyController();
    const baseSession = {
      runId: 'run-1',
      strategyKey: 'strategy-1',
      strategyType: 'liquidityProvision' as const,
      userId: 'user-1',
      clientId: 'order-1',
      cadenceMs: 30_000,
      nextRunAtMs: 0,
      params: {
        connectorId: 'uniswapV3',
        chainId: 1,
        tradingAccountId: 'account-1',
        ledgerOrderId: 'ledger-order-1',
        token0: '0xtoken0',
        token1: '0xtoken1',
        positionId: 'position-1',
      },
    };

    const rebalance = await controller.decideActions({
      ts: '2026-06-22T00:00:00.000Z',
      session: {
        ...baseSession,
        params: {
          ...baseSession.params,
          positionStatus: 'out_of_range',
        },
      },
    });
    const collect = await controller.decideActions({
      ts: '2026-06-22T00:00:00.000Z',
      session: {
        ...baseSession,
        params: {
          ...baseSession.params,
          positionStatus: 'active',
          uncollectedFeeValue: 10,
          feeThreshold: 5,
        },
      },
    });

    expect(rebalance.map((action) => action.type)).toEqual([
      'REMOVE_LIQUIDITY',
      'ADD_LIQUIDITY',
    ]);
    expect(collect.map((action) => action.type)).toEqual(['COLLECT_FEES']);
  });
});
