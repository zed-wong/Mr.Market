import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';

import { EvmExecutionService } from '../evm-execution/evm-execution.service';
import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { OrderReservationService } from '../ledger/order-reservation.service';
import { TokenRegistryService } from '../token-registry/token-registry.service';
import { OrderLpPositionService } from './order-lp-position.service';

export type LpTokenAmount = {
  token: string;
  amountRaw: string;
};

@Injectable()
export class LpSettlementService {
  constructor(
    private readonly evmExecutionService: EvmExecutionService,
    private readonly tokenRegistryService: TokenRegistryService,
    private readonly balanceLedgerService: BalanceLedgerService,
    private readonly orderReservationService: OrderReservationService,
    private readonly orderLpPositionService: OrderLpPositionService,
  ) {}

  async settleAdd(command: {
    executionId: string;
    positionId: string;
    amounts: LpTokenAmount[];
    liquidity: string;
    positionTokenId?: string;
    lastConfirmedBlock?: number;
  }): Promise<void> {
    const execution = await this.requireConfirmed(command.executionId, 'lp_add');

    for (const tokenAmount of command.amounts) {
      const { assetId, amount } = await this.resolveAmount(
        execution.chainId,
        tokenAmount,
      );

      await this.balanceLedgerService.settleLpAdd({
        orderId: execution.ledgerOrderId,
        userOrderId: execution.userOrderId,
        accountLabel: execution.accountLabel,
        userId: execution.userId,
        assetId,
        tradingAccountId: execution.tradingAccountId,
        chainId: execution.chainId,
        amount: new BigNumber(amount).negated().toFixed(),
        idempotencyKey: `lp-add-settle:${execution.id}:${assetId}`,
        refType: 'evm_execution',
        refId: execution.id,
      });
      await this.orderReservationService.releaseRemainingAmmSwapTokenInReservation(
        {
          orderId: execution.ledgerOrderId,
          userOrderId: execution.userOrderId,
          accountLabel: execution.accountLabel,
          userId: execution.userId,
          intentId: execution.intentId,
          assetId,
          tradingAccountId: execution.tradingAccountId,
          chainId: execution.chainId,
          amount,
          reason: 'lp_add_settled',
        },
      );
    }

    await this.orderLpPositionService.updateStatus(command.positionId, {
      status: 'active',
      liquidity: command.liquidity,
      lastConfirmedBlock: command.lastConfirmedBlock,
    });
  }

  async settleRemove(command: {
    executionId: string;
    positionId: string;
    amounts: LpTokenAmount[];
    lastConfirmedBlock?: number;
  }): Promise<void> {
    const execution = await this.requireConfirmed(command.executionId, 'lp_remove');

    for (const tokenAmount of command.amounts) {
      const { assetId, amount } = await this.resolveAmount(
        execution.chainId,
        tokenAmount,
      );

      await this.balanceLedgerService.settleLpRemove({
        orderId: execution.ledgerOrderId,
        userOrderId: execution.userOrderId,
        accountLabel: execution.accountLabel,
        userId: execution.userId,
        assetId,
        tradingAccountId: execution.tradingAccountId,
        chainId: execution.chainId,
        amount,
        idempotencyKey: `lp-remove-settle:${execution.id}:${assetId}`,
        refType: 'evm_execution',
        refId: execution.id,
      });
    }

    await this.orderLpPositionService.updateStatus(command.positionId, {
      status: 'closed',
      closedByIntentId: execution.intentId,
      lastConfirmedBlock: command.lastConfirmedBlock,
      liquidity: '0',
    });
  }

  async settleCollect(command: {
    executionId: string;
    positionId: string;
    fees: LpTokenAmount[];
    lastConfirmedBlock?: number;
  }): Promise<void> {
    const execution = await this.requireConfirmed(command.executionId, 'lp_collect');

    for (const fee of command.fees) {
      const { assetId, amount } = await this.resolveAmount(
        execution.chainId,
        fee,
      );

      await this.balanceLedgerService.creditLpFee({
        orderId: execution.ledgerOrderId,
        userOrderId: execution.userOrderId,
        accountLabel: execution.accountLabel,
        userId: execution.userId,
        assetId,
        tradingAccountId: execution.tradingAccountId,
        chainId: execution.chainId,
        amount,
        idempotencyKey: `lp-fee-credit:${execution.id}:${assetId}`,
        refType: 'evm_execution',
        refId: execution.id,
      });
    }

    await this.orderLpPositionService.updateStatus(command.positionId, {
      status: 'active',
      lastConfirmedBlock: command.lastConfirmedBlock,
      uncollectedFees0: '0',
      uncollectedFees1: '0',
    });
  }

  private async requireConfirmed(executionId: string, executionType: string) {
    const execution = await this.evmExecutionService.requireById(executionId);

    if (execution.executionType !== executionType) {
      throw new Error(
        `EvmExecution ${execution.id} is ${execution.executionType}, not ${executionType}`,
      );
    }

    if (execution.status !== 'confirmed') {
      throw new Error(
        `EvmExecution ${execution.id} must be confirmed before LP settlement`,
      );
    }

    return execution;
  }

  private async resolveAmount(chainId: number, tokenAmount: LpTokenAmount) {
    const assetId = await this.tokenRegistryService.resolveAssetId(
      chainId,
      tokenAmount.token,
    );
    const token = await this.tokenRegistryService.resolveToken(assetId);
    const amount = new BigNumber(
      ethers.utils.formatUnits(tokenAmount.amountRaw, token.decimals),
    );

    if (!amount.isFinite() || amount.isLessThanOrEqualTo(0)) {
      throw new Error(`Invalid LP settlement amount ${tokenAmount.amountRaw}`);
    }

    return { assetId, amount: amount.toFixed() };
  }
}
