import { Injectable } from '@nestjs/common';
import { createStrategyKey } from 'src/common/helpers/strategyKey';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { WithdrawalService } from 'src/modules/mixin/withdrawal/withdrawal.service';

import { DurabilityService } from '../durability/durability.service';
import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { StrategyService } from '../strategy/strategy.service';
import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';

type PauseWithdrawCommand = {
  operationId: string;
  userId: string;
  clientId: string;
  strategyType: 'arbitrage' | 'pureMarketMaking' | 'volume';
  assetId: string;
  amount: string;
  destination: string;
  destinationTag: string;
};

@Injectable()
export class PauseWithdrawOrchestratorService {
  private readonly logger = new CustomLogger(PauseWithdrawOrchestratorService.name);

  constructor(
    private readonly strategyService: StrategyService,
    private readonly balanceLedgerService: BalanceLedgerService,
    private readonly withdrawalService: WithdrawalService,
    private readonly exchangeOrderTrackerService: ExchangeOrderTrackerService,
    private readonly exchangeConnectorAdapterService: ExchangeConnectorAdapterService,
    private readonly durabilityService: DurabilityService,
  ) {}

  async pauseAndWithdraw(command: PauseWithdrawCommand): Promise<void> {
    await this.strategyService.stopStrategyForUser(
      command.userId,
      command.clientId,
      command.strategyType,
    );

    const strategyKey = createStrategyKey({
      type: command.strategyType,
      user_id: command.userId,
      client_id: command.clientId,
    });

    await this.cancelUntilDrained(strategyKey);

    const unlockResult = await this.balanceLedgerService.unlockFunds({
      userId: command.userId,
      assetId: command.assetId,
      amount: command.amount,
      idempotencyKey: `unlock:${command.operationId}`,
      refType: 'withdraw_orchestrator_unlock',
      refId: command.clientId,
    });

    if (!unlockResult.applied) {
      throw new Error('Unlock mutation was not applied');
    }

    const debitResult = await this.balanceLedgerService.debitWithdrawal({
      userId: command.userId,
      assetId: command.assetId,
      amount: command.amount,
      idempotencyKey: `withdraw_debit:${command.operationId}`,
      refType: 'withdraw_orchestrator_debit',
      refId: command.clientId,
    });

    if (!debitResult.applied) {
      throw new Error('Withdrawal debit mutation was not applied');
    }

    try {
      await this.durabilityService.appendOutboxEvent({
        topic: 'withdrawal.orchestrator.pending',
        aggregateType: 'withdrawal_orchestrator',
        aggregateId: command.operationId,
        payload: {
          operationId: command.operationId,
          userId: command.userId,
          clientId: command.clientId,
          assetId: command.assetId,
          amount: command.amount,
          destination: command.destination,
          destinationTag: command.destinationTag || 'withdraw-orchestrator',
          ledgerDebitIdempotencyKey: `withdraw_debit:${command.operationId}`,
        },
      });

      await this.withdrawalService.executeWithdrawal(
        command.assetId,
        command.destination,
        command.destinationTag || 'withdraw-orchestrator',
        command.amount,
        `withdraw_execute:${command.operationId}`,
      );

      await this.durabilityService.appendOutboxEvent({
        topic: 'withdrawal.orchestrator.completed',
        aggregateType: 'withdrawal_orchestrator',
        aggregateId: command.operationId,
        payload: {
          operationId: command.operationId,
          status: 'completed',
          ledgerDebitIdempotencyKey: `withdraw_debit:${command.operationId}`,
        },
      });
    } catch (error) {
      try {
        await this.durabilityService.appendOutboxEvent({
          topic: 'withdrawal.orchestrator.failed',
          aggregateType: 'withdrawal_orchestrator',
          aggregateId: command.operationId,
          payload: {
            operationId: command.operationId,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            ledgerDebitIdempotencyKey: `withdraw_debit:${command.operationId}`,
          },
        });
      } catch (appendError) {
        this.logger.error(
          `Failed to append withdrawal.orchestrator.failed for ${command.operationId}: ${
            appendError instanceof Error ? appendError.message : String(appendError)
          }`,
        );
      }

      await this.balanceLedgerService.adjust({
        userId: command.userId,
        assetId: command.assetId,
        amount: command.amount,
        idempotencyKey: `withdraw_debit:${command.operationId}:rollback`,
        refType: 'withdraw_orchestrator_rollback',
        refId: command.clientId,
      });

      throw error;
    }
  }

  private async cancelUntilDrained(strategyKey: string): Promise<void> {
    const timeoutMs = 30_000;
    const pollMs = 500;
    const startedAt = Date.now();

    while (true) {
      const openOrders =
        this.exchangeOrderTrackerService.getOpenOrders(strategyKey);

      if (openOrders.length === 0) {
        return;
      }

      for (const order of openOrders) {
        await this.exchangeConnectorAdapterService.cancelOrder(
          order.exchange,
          order.pair,
          order.exchangeOrderId,
        );
      }

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error('Open orders not drained for strategy');
      }

      await this.sleep(pollMs);
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
