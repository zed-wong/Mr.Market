import { AmmSwapSettlementService } from './amm-swap-settlement.service';

describe('AmmSwapSettlementService', () => {
  const execution = {
    id: 'execution-1',
    executionType: 'swap',
    status: 'confirmed',
    intentId: 'intent-1',
    chainId: 1,
    userId: 'user-1',
    userOrderId: 'user-order-1',
    ledgerOrderId: 'ledger-order-1',
    accountLabel: 'default',
    tradingAccountId: 'account-1',
    gasSponsorLedgerOrderId: 'gas-sponsor-order',
    effectiveGasCost: '21000000000000',
  };
  const evmExecutionService = {
    requireById: jest.fn().mockResolvedValue(execution),
  };
  const tokenRegistryService = {
    resolveAssetId: jest
      .fn()
      .mockImplementation(async (_chainId: number, address: string) =>
        address === '0xtokenin' ? 'asset-usdc' : 'asset-weth',
      ),
    resolveNativeAssetId: jest.fn().mockResolvedValue('asset-eth'),
    resolveToken: jest.fn().mockImplementation(async (assetId: string) => {
      const decimalsByAssetId: Record<string, number> = {
        'asset-usdc': 6,
        'asset-weth': 18,
        'asset-eth': 18,
      };

      return { assetId, decimals: decimalsByAssetId[assetId] };
    }),
  };
  const balanceLedgerService = {
    settleSwap: jest.fn().mockResolvedValue({ applied: true }),
    debitGas: jest.fn().mockResolvedValue({ applied: true }),
  };
  const orderReservationService = {
    releaseRemainingAmmSwapTokenInReservation: jest
      .fn()
      .mockResolvedValue({ applied: true }),
    releaseRemainingGasSponsorReservation: jest
      .fn()
      .mockResolvedValue({ applied: true }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    evmExecutionService.requireById.mockResolvedValue(execution);
  });

  it('settles confirmed swap token movement and gas sponsorship', async () => {
    const service = new AmmSwapSettlementService(
      evmExecutionService as any,
      tokenRegistryService as any,
      balanceLedgerService as any,
      orderReservationService as any,
    );

    await service.settleConfirmedSwap({
      executionId: 'execution-1',
      tokenIn: '0xtokenin',
      tokenOut: '0xtokenout',
      amountInRaw: '25000000',
      amountOutRaw: '1000000000000000000',
    });

    expect(balanceLedgerService.settleSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ledger-order-1',
        userOrderId: 'user-order-1',
        userId: 'user-1',
        assetId: 'asset-usdc',
        amount: '-25',
        idempotencyKey: 'swap-settle:execution-1:asset-usdc:debit',
      }),
    );
    expect(balanceLedgerService.settleSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'asset-weth',
        amount: '1',
        idempotencyKey: 'swap-settle:execution-1:asset-weth:credit',
      }),
    );
    expect(balanceLedgerService.debitGas).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'gas-sponsor-order',
        userOrderId: 'user-order-1',
        accountLabel: 'funding_operator',
        userId: 'user-1',
        assetId: 'asset-eth',
        amount: '0.000021',
        idempotencyKey: 'gas-debit:execution-1:asset-eth',
      }),
    );
    expect(
      orderReservationService.releaseRemainingAmmSwapTokenInReservation,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ledger-order-1',
        assetId: 'asset-usdc',
        intentId: 'intent-1',
        reason: 'amm_swap_settled',
      }),
    );
    expect(
      orderReservationService.releaseRemainingGasSponsorReservation,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'gas-sponsor-order',
        gasAssetId: 'asset-eth',
        intentId: 'intent-1',
        reason: 'gas_debit_settled',
      }),
    );
  });

  it('rejects settlement before confirmation', async () => {
    evmExecutionService.requireById.mockResolvedValue({
      ...execution,
      status: 'submitted',
    });
    const service = new AmmSwapSettlementService(
      evmExecutionService as any,
      tokenRegistryService as any,
      balanceLedgerService as any,
      orderReservationService as any,
    );

    await expect(
      service.settleConfirmedSwap({
        executionId: 'execution-1',
        tokenIn: '0xtokenin',
        tokenOut: '0xtokenout',
        amountInRaw: '25000000',
        amountOutRaw: '1000000000000000000',
      }),
    ).rejects.toThrow('must be confirmed before swap settlement');
  });
});
