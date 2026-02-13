import { Injectable } from '@nestjs/common';
import { createStrategyKey } from 'src/common/helpers/strategyKey';
import { WithdrawalService } from 'src/modules/mixin/withdrawal/withdrawal.service';

import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { StrategyService } from '../strategy/strategy.service';
import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';

type PauseWithdrawCommand = {
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
  constructor(
    private readonly strategyService: StrategyService,
    private readonly balanceLedgerService: BalanceLedgerService,
    private readonly withdrawalService: WithdrawalService,
    private readonly exchangeOrderTrackerService: ExchangeOrderTrackerService,
    private readonly exchangeConnectorAdapterService: ExchangeConnectorAdapterService,
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

    await this.balanceLedgerService.unlockFunds({
      userId: command.userId,
      assetId: command.assetId,
      amount: command.amount,
      idempotencyKey: `unlock:${command.userId}:${command.clientId}:${command.assetId}:${command.amount}`,
      refType: 'withdraw_orchestrator_unlock',
      refId: command.clientId,
    });

    await this.balanceLedgerService.debitWithdrawal({
      userId: command.userId,
      assetId: command.assetId,
      amount: command.amount,
      idempotencyKey: `withdraw_debit:${command.userId}:${command.clientId}:${command.assetId}:${command.amount}`,
      refType: 'withdraw_orchestrator_debit',
      refId: command.clientId,
    });

    await this.withdrawalService.executeWithdrawal(
      command.assetId,
      command.destination,
      command.destinationTag || 'withdraw-orchestrator',
      command.amount,
    );
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
