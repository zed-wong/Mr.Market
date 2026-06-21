import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';

import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { OrderReservationService } from '../ledger/order-reservation.service';
import { TokenRegistryService } from '../token-registry/token-registry.service';
import { EvmExecutionService } from './evm-execution.service';

export type AmmSwapSettlementCommand = {
  executionId: string;
  tokenIn: string;
  tokenOut: string;
  amountInRaw: string;
  amountOutRaw: string;
};

@Injectable()
export class AmmSwapSettlementService {
  constructor(
    private readonly evmExecutionService: EvmExecutionService,
    private readonly tokenRegistryService: TokenRegistryService,
    private readonly balanceLedgerService: BalanceLedgerService,
    private readonly orderReservationService: OrderReservationService,
  ) {}

  async settleConfirmedSwap(command: AmmSwapSettlementCommand): Promise<void> {
    const execution = await this.evmExecutionService.requireById(
      command.executionId,
    );

    if (execution.executionType !== 'swap') {
      throw new Error(
        `EvmExecution ${execution.id} is ${execution.executionType}, not swap`,
      );
    }

    if (execution.status !== 'confirmed') {
      throw new Error(
        `EvmExecution ${execution.id} must be confirmed before swap settlement`,
      );
    }

    const [tokenInAssetId, tokenOutAssetId] = await Promise.all([
      this.tokenRegistryService.resolveAssetId(
        execution.chainId,
        command.tokenIn,
      ),
      this.tokenRegistryService.resolveAssetId(
        execution.chainId,
        command.tokenOut,
      ),
    ]);
    const [tokenIn, tokenOut] = await Promise.all([
      this.tokenRegistryService.resolveToken(tokenInAssetId),
      this.tokenRegistryService.resolveToken(tokenOutAssetId),
    ]);
    const amountIn = this.formatRawAmount(
      command.amountInRaw,
      tokenIn.decimals,
    );
    const amountOut = this.formatRawAmount(
      command.amountOutRaw,
      tokenOut.decimals,
    );

    await this.balanceLedgerService.settleSwap({
      orderId: execution.ledgerOrderId,
      userOrderId: execution.userOrderId,
      accountLabel: execution.accountLabel,
      userId: execution.userId,
      assetId: tokenInAssetId,
      tradingAccountId: execution.tradingAccountId,
      chainId: execution.chainId,
      amount: new BigNumber(amountIn).negated().toFixed(),
      idempotencyKey: `swap-settle:${execution.id}:${tokenInAssetId}:debit`,
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
        assetId: tokenInAssetId,
        tradingAccountId: execution.tradingAccountId,
        chainId: execution.chainId,
        amount: amountIn,
        reason: 'amm_swap_settled',
      },
    );
    await this.balanceLedgerService.settleSwap({
      orderId: execution.ledgerOrderId,
      userOrderId: execution.userOrderId,
      accountLabel: execution.accountLabel,
      userId: execution.userId,
      assetId: tokenOutAssetId,
      tradingAccountId: execution.tradingAccountId,
      chainId: execution.chainId,
      amount: amountOut,
      idempotencyKey: `swap-settle:${execution.id}:${tokenOutAssetId}:credit`,
      refType: 'evm_execution',
      refId: execution.id,
    });

    await this.settleGasIfPresent(command.executionId);
  }

  async settleGasIfPresent(executionId: string): Promise<void> {
    const execution = await this.evmExecutionService.requireById(executionId);

    if (
      !execution.gasSponsorLedgerOrderId ||
      !execution.effectiveGasCost ||
      new BigNumber(execution.effectiveGasCost).isLessThanOrEqualTo(0)
    ) {
      return;
    }

    const gasAssetId = await this.tokenRegistryService.resolveNativeAssetId(
      execution.chainId,
    );
    const gasToken = await this.tokenRegistryService.resolveToken(gasAssetId);
    const gasAmount = this.formatRawAmount(
      execution.effectiveGasCost,
      gasToken.decimals,
    );

    await this.balanceLedgerService.debitGas({
      orderId: execution.gasSponsorLedgerOrderId,
      userOrderId: execution.userOrderId,
      accountLabel: 'funding_operator',
      userId: execution.userId,
      assetId: gasAssetId,
      tradingAccountId: execution.tradingAccountId,
      chainId: execution.chainId,
      amount: gasAmount,
      idempotencyKey: `gas-debit:${execution.id}:${gasAssetId}`,
      refType: 'evm_execution',
      refId: execution.id,
    });
    await this.orderReservationService.releaseRemainingGasSponsorReservation({
      orderId: execution.gasSponsorLedgerOrderId,
      userOrderId: execution.userOrderId,
      accountLabel: 'funding_operator',
      userId: execution.userId,
      intentId: execution.intentId,
      gasAssetId,
      estimatedGasCost: gasAmount,
      tradingAccountId: execution.tradingAccountId,
      chainId: execution.chainId,
      reason: 'gas_debit_settled',
    });
  }

  private formatRawAmount(rawAmount: string, decimals: number): string {
    const amount = new BigNumber(
      ethers.utils.formatUnits(rawAmount, decimals),
    );

    if (!amount.isFinite() || amount.isLessThanOrEqualTo(0)) {
      throw new Error(`Invalid on-chain settlement amount ${rawAmount}`);
    }

    return amount.toFixed();
  }
}
