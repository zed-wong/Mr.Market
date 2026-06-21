import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BigNumber, ethers } from 'ethers';

import { TradingAccountService } from '../trading-account/trading-account.service';
import { EvmExecutionService } from './evm-execution.service';

type EvmConfirmationPolicy = {
  requiredConfirmations: number;
  pollIntervalMs: number;
  stuckPendingBlocks: number;
};

const DEFAULT_CONFIRMATION_POLICIES: Record<number, EvmConfirmationPolicy> = {
  1: {
    requiredConfirmations: 12,
    pollIntervalMs: 12_000,
    stuckPendingBlocks: 25,
  },
  56: {
    requiredConfirmations: 15,
    pollIntervalMs: 3_000,
    stuckPendingBlocks: 60,
  },
  137: {
    requiredConfirmations: 20,
    pollIntervalMs: 2_000,
    stuckPendingBlocks: 120,
  },
};

const DEFAULT_CONFIRMATION_POLICY: EvmConfirmationPolicy = {
  requiredConfirmations: 12,
  pollIntervalMs: 10_000,
  stuckPendingBlocks: 50,
};

@Injectable()
export class EvmReceiptConfirmerService {
  constructor(
    private readonly evmExecutionService: EvmExecutionService,
    private readonly tradingAccountService: TradingAccountService,
    private readonly configService: ConfigService,
  ) {}

  getConfirmationPolicy(chainId: number): EvmConfirmationPolicy {
    const defaults =
      DEFAULT_CONFIRMATION_POLICIES[chainId] || DEFAULT_CONFIRMATION_POLICY;

    return {
      requiredConfirmations: Number(
        this.configService.get(
          `web3.confirmation.${chainId}.required_confirmations`,
          defaults.requiredConfirmations,
        ),
      ),
      pollIntervalMs: Number(
        this.configService.get(
          `web3.confirmation.${chainId}.poll_interval_ms`,
          defaults.pollIntervalMs,
        ),
      ),
      stuckPendingBlocks: Number(
        this.configService.get(
          `web3.confirmation.${chainId}.stuck_pending_blocks`,
          defaults.stuckPendingBlocks,
        ),
      ),
    };
  }

  async confirmExecution(executionId: string) {
    const execution = await this.evmExecutionService.requireById(executionId);

    if (execution.status !== 'submitted' || !execution.txHash) {
      return execution;
    }

    const signer = await this.tradingAccountService.getSigner(
      execution.tradingAccountId,
      execution.chainId,
    );

    if (!signer.provider) {
      throw new Error(`No provider configured for chainId=${execution.chainId}`);
    }

    const receipt = await signer.provider.getTransactionReceipt(
      execution.txHash,
    );
    const currentBlockNumber = await signer.provider.getBlockNumber();

    if (!receipt?.blockNumber) {
      await this.evmExecutionService.recordPendingObservation(
        execution.id,
        currentBlockNumber,
      );
      const firstPendingBlockNumber =
        execution.firstPendingBlockNumber || currentBlockNumber;
      const pendingBlocks = Math.max(
        currentBlockNumber - firstPendingBlockNumber,
        0,
      );
      const policy = this.getConfirmationPolicy(execution.chainId);

      if (pendingBlocks >= policy.stuckPendingBlocks) {
        return await this.evmExecutionService.markManualReview(
          execution.id,
          'stuck_pending',
        );
      }

      return execution;
    }

    const confirmationCount = Math.max(
      currentBlockNumber - receipt.blockNumber + 1,
      0,
    );

    if (confirmationCount < execution.requiredConfirmations) {
      return execution;
    }

    const effectiveGasPrice =
      receipt.effectiveGasPrice ||
      (receipt as ethers.providers.TransactionReceipt & {
        gasPrice?: BigNumber;
      }).gasPrice ||
      BigNumber.from(0);
    const gasUsed = receipt.gasUsed || BigNumber.from(0);
    const effectiveGasCost = gasUsed.mul(effectiveGasPrice).toString();
    const payload = this.buildReceiptPayload(receipt);

    if (receipt.status === 0) {
      return await this.evmExecutionService.markReverted(execution.id, {
        blockNumber: receipt.blockNumber,
        confirmationCount,
        receipt: payload,
        gasUsed: gasUsed.toString(),
        gasPrice: effectiveGasPrice.toString(),
        effectiveGasCost,
      });
    }

    return await this.evmExecutionService.markConfirmed(execution.id, {
      blockNumber: receipt.blockNumber,
      confirmationCount,
      receipt: payload,
      gasUsed: gasUsed.toString(),
      gasPrice: effectiveGasPrice.toString(),
      effectiveGasCost,
    });
  }

  async monitorConfirmedExecution(executionId: string) {
    const execution = await this.evmExecutionService.requireById(executionId);

    if (
      execution.status !== 'confirmed' ||
      !execution.txHash ||
      !execution.receiptContentHash
    ) {
      return execution;
    }

    const signer = await this.tradingAccountService.getSigner(
      execution.tradingAccountId,
      execution.chainId,
    );

    if (!signer.provider) {
      throw new Error(`No provider configured for chainId=${execution.chainId}`);
    }

    const receipt = await signer.provider.getTransactionReceipt(
      execution.txHash,
    );

    if (!receipt?.blockNumber) {
      return await this.evmExecutionService.markManualReview(
        execution.id,
        'reorg_receipt_missing',
      );
    }

    const payload = this.buildReceiptPayload(receipt);
    const contentHash =
      this.evmExecutionService.hashReceiptForComparison(payload);

    if (contentHash !== execution.receiptContentHash) {
      return await this.evmExecutionService.markManualReview(
        execution.id,
        'reorg_receipt_changed',
      );
    }

    return execution;
  }

  private buildReceiptPayload(
    receipt: ethers.providers.TransactionReceipt,
  ): Record<string, unknown> {
    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
      logs: receipt.logs,
    };
  }
}
