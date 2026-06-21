import { EvmChildExecutionPlannerService } from './evm-child-execution-planner.service';

describe('EvmChildExecutionPlannerService', () => {
  it('preallocates approve/wrap children with parent attribution', async () => {
    const nonceAllocatorService = {
      preAllocate: jest.fn(async (command) => ({
        id: `${command.executionType}-execution`,
        ...command,
      })),
    };
    const service = new EvmChildExecutionPlannerService(
      nonceAllocatorService as any,
    );

    const executions = await service.preAllocateChildren({
      parentExecutionId: 'parent-execution',
      childTypes: ['approve', 'wrap'],
      userOrderId: 'user-order-1',
      userId: 'user-1',
      ledgerOrderId: 'ledger-order-1',
      accountLabel: 'default',
      intentId: 'intent-1',
      connectorId: 'uniswapV3',
      exchangeType: 'amm',
      chainId: 1,
      tradingAccountId: 'account-1',
      requiredConfirmations: 12,
      gasSponsorLedgerOrderId: 'gas-sponsor',
    });

    expect(executions.map((execution) => execution.executionType)).toEqual([
      'approve',
      'wrap',
    ]);
    expect(nonceAllocatorService.preAllocate).toHaveBeenCalledWith(
      expect.objectContaining({
        parentExecutionId: 'parent-execution',
        executionType: 'approve',
      }),
    );
    expect(nonceAllocatorService.preAllocate).toHaveBeenCalledWith(
      expect.objectContaining({
        parentExecutionId: 'parent-execution',
        executionType: 'wrap',
      }),
    );
  });
});
