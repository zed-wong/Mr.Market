import { Injectable } from '@nestjs/common';

import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { EvmExecutionService } from './evm-execution.service';

export type EvmExecutionReconciliationResult = {
  executionId: string;
  matches: boolean;
  missingTypes: string[];
};

@Injectable()
export class EvmExecutionReconciliationRunner {
  constructor(
    private readonly evmExecutionService: EvmExecutionService,
    private readonly balanceLedgerService: BalanceLedgerService,
  ) {}

  async reconcileExecution(
    executionId: string,
  ): Promise<EvmExecutionReconciliationResult> {
    const execution = await this.evmExecutionService.requireById(executionId);

    if (execution.status !== 'confirmed' || execution.executionType !== 'swap') {
      return { executionId, matches: true, missingTypes: [] };
    }

    const entries = await this.balanceLedgerService.findByOrderId(
      execution.ledgerOrderId,
    );
    const matchingEntries = entries.filter(
      (entry) => entry.refType === 'evm_execution' && entry.refId === execution.id,
    );
    const hasSwapDebit = matchingEntries.some(
      (entry) => entry.type === 'swap_settle' && entry.amount.startsWith('-'),
    );
    const hasSwapCredit = matchingEntries.some(
      (entry) => entry.type === 'swap_settle' && !entry.amount.startsWith('-'),
    );
    const missingTypes: string[] = [];

    if (!hasSwapDebit) {
      missingTypes.push('swap_settle_debit');
    }
    if (!hasSwapCredit) {
      missingTypes.push('swap_settle_credit');
    }

    if (execution.gasSponsorLedgerOrderId && execution.effectiveGasCost) {
      const gasEntries = await this.balanceLedgerService.findByOrderId(
        execution.gasSponsorLedgerOrderId,
      );
      const hasGasDebit = gasEntries.some(
        (entry) =>
          entry.refType === 'evm_execution' &&
          entry.refId === execution.id &&
          entry.type === 'gas_debit',
      );

      if (!hasGasDebit) {
        missingTypes.push('gas_debit');
      }
    }

    if (missingTypes.length > 0) {
      await this.evmExecutionService.markManualReview(
        execution.id,
        `evm_execution_reconciliation_missing:${missingTypes.join(',')}`,
      );
    }

    return {
      executionId,
      matches: missingTypes.length === 0,
      missingTypes,
    };
  }
}
