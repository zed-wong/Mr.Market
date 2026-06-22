import { LpSettlementService } from './lp-settlement.service';

describe('LpSettlementService', () => {
  const baseExecution = {
    id: 'execution-1',
    executionType: 'lp_add',
    status: 'confirmed',
    intentId: 'intent-1',
    chainId: 1,
    userId: 'user-1',
    userOrderId: 'user-order-1',
    ledgerOrderId: 'ledger-order-1',
    accountLabel: 'default',
    tradingAccountId: 'account-1',
  };
  const evmExecutionService = {
    requireById: jest.fn().mockResolvedValue(baseExecution),
  };
  const tokenRegistryService = {
    resolveAssetId: jest
      .fn()
      .mockImplementation(async (_chainId: number, token: string) =>
        token === '0xtoken0' ? 'asset-token0' : 'asset-token1',
      ),
    resolveToken: jest.fn().mockImplementation(async (assetId: string) => ({
      assetId,
      decimals: 6,
    })),
  };
  const balanceLedgerService = {
    settleLpAdd: jest.fn().mockResolvedValue({ applied: true }),
    settleLpRemove: jest.fn().mockResolvedValue({ applied: true }),
    creditLpFee: jest.fn().mockResolvedValue({ applied: true }),
  };
  const orderReservationService = {
    releaseRemainingAmmSwapTokenInReservation: jest
      .fn()
      .mockResolvedValue({ applied: true }),
  };
  const orderLpPositionService = {
    updateStatus: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    evmExecutionService.requireById.mockResolvedValue(baseExecution);
  });

  function createService() {
    return new LpSettlementService(
      evmExecutionService as any,
      tokenRegistryService as any,
      balanceLedgerService as any,
      orderReservationService as any,
      orderLpPositionService as any,
    );
  }

  it('settles LP add into external locked exposure', async () => {
    const service = createService();

    await service.settleAdd({
      executionId: 'execution-1',
      positionId: 'position-1',
      liquidity: '500',
      amounts: [{ token: '0xtoken0', amountRaw: '25000000' }],
      lastConfirmedBlock: 100,
    });

    expect(balanceLedgerService.settleLpAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ledger-order-1',
        userOrderId: 'user-order-1',
        assetId: 'asset-token0',
        amount: '-25',
        idempotencyKey: 'lp-add-settle:execution-1:asset-token0',
      }),
    );
    expect(orderLpPositionService.updateStatus).toHaveBeenCalledWith(
      'position-1',
      expect.objectContaining({
        status: 'active',
        liquidity: '500',
        lastConfirmedBlock: 100,
      }),
    );
  });

  it('settles LP remove as available credits and closes position', async () => {
    evmExecutionService.requireById.mockResolvedValue({
      ...baseExecution,
      executionType: 'lp_remove',
    });
    const service = createService();

    await service.settleRemove({
      executionId: 'execution-1',
      positionId: 'position-1',
      amounts: [{ token: '0xtoken0', amountRaw: '10000000' }],
    });

    expect(balanceLedgerService.settleLpRemove).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '10',
        idempotencyKey: 'lp-remove-settle:execution-1:asset-token0',
      }),
    );
    expect(orderLpPositionService.updateStatus).toHaveBeenCalledWith(
      'position-1',
      expect.objectContaining({
        status: 'closed',
        liquidity: '0',
        closedByIntentId: 'intent-1',
      }),
    );
  });

  it('settles collected LP fees as fee credits', async () => {
    evmExecutionService.requireById.mockResolvedValue({
      ...baseExecution,
      executionType: 'lp_collect',
    });
    const service = createService();

    await service.settleCollect({
      executionId: 'execution-1',
      positionId: 'position-1',
      fees: [{ token: '0xtoken1', amountRaw: '3000000' }],
    });

    expect(balanceLedgerService.creditLpFee).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'asset-token1',
        amount: '3',
        idempotencyKey: 'lp-fee-credit:execution-1:asset-token1',
      }),
    );
    expect(orderLpPositionService.updateStatus).toHaveBeenCalledWith(
      'position-1',
      expect.objectContaining({
        status: 'active',
        uncollectedFees0: '0',
        uncollectedFees1: '0',
      }),
    );
  });
});
