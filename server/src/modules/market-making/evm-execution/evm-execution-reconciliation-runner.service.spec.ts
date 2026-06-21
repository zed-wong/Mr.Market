import { EvmExecutionReconciliationRunner } from './evm-execution-reconciliation-runner.service';

describe('EvmExecutionReconciliationRunner', () => {
  it('routes confirmed swaps with missing ledger settlement to manual review', async () => {
    const execution = {
      id: 'execution-1',
      status: 'confirmed',
      executionType: 'swap',
      ledgerOrderId: 'ledger-order-1',
      gasSponsorLedgerOrderId: 'gas-order-1',
      effectiveGasCost: '100',
    };
    const evmExecutionService = {
      requireById: jest.fn().mockResolvedValue(execution),
      markManualReview: jest.fn().mockResolvedValue({
        ...execution,
        status: 'manual_review',
      }),
    };
    const balanceLedgerService = {
      findByOrderId: jest
        .fn()
        .mockResolvedValueOnce([
          {
            type: 'swap_settle',
            amount: '-25',
            refType: 'evm_execution',
            refId: 'execution-1',
          },
        ])
        .mockResolvedValueOnce([]),
    };
    const runner = new EvmExecutionReconciliationRunner(
      evmExecutionService as any,
      balanceLedgerService as any,
    );

    const result = await runner.reconcileExecution('execution-1');

    expect(result).toEqual({
      executionId: 'execution-1',
      matches: false,
      missingTypes: ['swap_settle_credit', 'gas_debit'],
    });
    expect(evmExecutionService.markManualReview).toHaveBeenCalledWith(
      'execution-1',
      'evm_execution_reconciliation_missing:swap_settle_credit,gas_debit',
    );
  });
});
