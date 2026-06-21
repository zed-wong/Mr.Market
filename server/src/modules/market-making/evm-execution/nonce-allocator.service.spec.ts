import { NonceAllocatorService } from './nonce-allocator.service';

describe('NonceAllocatorService', () => {
  it('preallocates max(on-chain pending nonce, local max + 1)', async () => {
    const evmExecutionService = {
      getMaxAllocatedNonce: jest.fn().mockResolvedValue(7),
      createCreated: jest.fn(async (command) => ({ id: 'execution-1', ...command })),
    };
    const tradingAccountService = {
      getSigner: jest.fn().mockResolvedValue({
        address: '0xwallet',
        provider: {
          getTransactionCount: jest.fn().mockResolvedValue(5),
        },
      }),
    };
    const service = new NonceAllocatorService(
      evmExecutionService as any,
      tradingAccountService as any,
    );

    const execution = await service.preAllocate({
      executionType: 'swap',
      userOrderId: 'user-order-1',
      userId: 'user-1',
      ledgerOrderId: 'ledger-order-1',
      intentId: 'intent-1',
      connectorId: 'uniswapV3',
      exchangeType: 'amm',
      chainId: 1,
      tradingAccountId: 'account-1',
      requiredConfirmations: 12,
    });

    expect(execution.nonce).toBe(8);
    expect(evmExecutionService.createCreated).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 8 }),
    );
  });
});
