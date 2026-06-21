import { Injectable } from '@nestjs/common';

import { TradingAccountService } from '../trading-account/trading-account.service';
import {
  CreateEvmExecutionCommand,
  EvmExecutionService,
} from './evm-execution.service';

@Injectable()
export class NonceAllocatorService {
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly evmExecutionService: EvmExecutionService,
    private readonly tradingAccountService: TradingAccountService,
  ) {}

  async preAllocate(
    command: Omit<CreateEvmExecutionCommand, 'nonce'>,
  ) {
    const lockKey = `${command.tradingAccountId}:${command.chainId}`;

    return await this.withLock(lockKey, async () => {
      const nonce = await this.allocateNonce(
        command.tradingAccountId,
        command.chainId,
      );

      return await this.evmExecutionService.createCreated({
        ...command,
        nonce,
      });
    });
  }

  private async allocateNonce(
    tradingAccountId: string,
    chainId: number,
  ): Promise<number> {
    const signer = await this.tradingAccountService.getSigner(
      tradingAccountId,
      chainId,
    );

    if (!signer.provider) {
      throw new Error(`No provider configured for chainId=${chainId}`);
    }

    const [allocatedNonce, onchainNonce] = await Promise.all([
      this.evmExecutionService.getMaxAllocatedNonce(tradingAccountId, chainId),
      signer.provider.getTransactionCount(signer.address, 'pending'),
    ]);

    return Math.max(allocatedNonce === null ? -1 : allocatedNonce, onchainNonce - 1) + 1;
  }

  private async withLock<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const currentTail = this.locks.get(key) || Promise.resolve();
    let releaseCurrent: () => void = () => {};
    const nextTail = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const chainedTail = currentTail.then(() => nextTail);

    this.locks.set(key, chainedTail);
    await currentTail;

    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (this.locks.get(key) === chainedTail) {
        this.locks.delete(key);
      }
    }
  }
}
