import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { createHash, randomUUID } from 'crypto';
import { ethers } from 'ethers';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import {
  Web3Withdrawal,
  Web3WithdrawalStatus,
} from 'src/common/entities/web3/web3-withdrawal.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { BalanceLedgerService } from 'src/modules/market-making/ledger/balance-ledger.service';
import { Repository } from 'typeorm';

import { Web3DepositService } from '../deposit/web3-deposit.service';
import { Web3Service } from '../web3.service';

type WithdrawBody = {
  chainId?: unknown;
  tokenAddress?: unknown;
  amount?: unknown;
  idempotencyKey?: unknown;
  clientRequestId?: unknown;
  requestId?: unknown;
};

const WEB3_WITHDRAW_NAMESPACE = '/web3/withdraw';
const WEB3_WALLET_ORDER_PREFIX = 'web3:wallet';

@Injectable()
export class Web3WithdrawService {
  private readonly requestLocks = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(Web3Withdrawal)
    private readonly withdrawalRepository: Repository<Web3Withdrawal>,
    @InjectRepository(MarketMakingOrderBalance)
    private readonly orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    private readonly web3Service: Web3Service,
    private readonly web3DepositService: Web3DepositService,
    private readonly balanceLedgerService: BalanceLedgerService,
  ) {}

  async createWithdrawal(
    userId: string,
    recipientAddressInput: string,
    body: WithdrawBody,
  ) {
    const request = this.buildWithdrawRequest(
      userId,
      recipientAddressInput,
      body,
    );

    return await this.withRequestLock(request.idempotencyKey, async () => {
      const existing = await this.withdrawalRepository.findOneBy({
        idempotencyKey: request.idempotencyKey,
      });

      if (existing) {
        this.assertIdempotentReplay(existing, request.payloadHash);

        return this.serializeResponse(existing);
      }

      await this.assertSufficientAvailableBalance(request);

      const now = getRFC3339Timestamp();
      const withdrawal = this.withdrawalRepository.create({
        withdrawalId: randomUUID(),
        userId,
        chainId: request.chainId,
        tokenAddress: request.tokenAddress,
        assetId: request.assetId,
        amount: request.amount,
        recipientAddress: request.recipientAddress,
        status: 'pending',
        idempotencyKey: request.idempotencyKey,
        payloadHash: request.payloadHash,
        ledgerDebitIdempotencyKey: request.ledgerDebitIdempotencyKey,
        createdAt: now,
        updatedAt: now,
      });

      await this.withdrawalRepository.save(withdrawal);
      const ledgerResult = await this.balanceLedgerService.debitWithdrawal({
        orderId: request.walletOrderId,
        userId,
        assetId: request.assetId,
        amount: request.amount,
        idempotencyKey: request.ledgerDebitIdempotencyKey,
        refType: 'web3_wallet_withdrawal',
        refId: withdrawal.withdrawalId,
      });

      withdrawal.ledgerEntryId = ledgerResult.entry.entryId;
      await this.trySubmitWithdrawal(withdrawal, request);
      withdrawal.updatedAt = getRFC3339Timestamp();
      await this.withdrawalRepository.save(withdrawal);

      return this.serializeResponse(withdrawal, ledgerResult.balance);
    });
  }

  async getWithdrawal(userId: string, withdrawalId: string) {
    const withdrawal = await this.withdrawalRepository.findOneBy({
      withdrawalId,
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }
    if (withdrawal.userId !== userId) {
      throw new ForbiddenException('Withdrawal belongs to a different user');
    }

    return this.serializeResponse(withdrawal);
  }

  private async trySubmitWithdrawal(
    withdrawal: Web3Withdrawal,
    request: ReturnType<Web3WithdrawService['buildWithdrawRequest']>,
  ): Promise<void> {
    const signer = this.web3Service.getSigner(request.chainId);

    if (!signer?.provider) {
      withdrawal.status = 'blocked';
      withdrawal.failureReason = `Web3 signer is not configured for chain ${request.chainId}`;

      return;
    }

    try {
      const transfer = await this.web3Service.transferErc20(
        request.chainId,
        request.tokenAddress,
        request.recipientAddress,
        request.onChainAmount,
      );

      withdrawal.status = 'submitted';
      withdrawal.txHash = transfer.txHash;
      withdrawal.failureReason = undefined;
    } catch (error) {
      withdrawal.status = 'failed';
      withdrawal.failureReason = this.normalizeFailureReason(error);
    }
  }

  private buildWithdrawRequest(
    userId: string,
    recipientAddressInput: string,
    body: WithdrawBody,
  ) {
    const token = this.web3DepositService.resolveSupportedTokenForChain(
      body?.chainId,
      body?.tokenAddress,
    );
    const amount = this.normalizeHumanAmount(body?.amount);
    const recipientAddress = this.normalizeAddress(
      recipientAddressInput,
      'RECIPIENT_ADDRESS_INVALID',
      'authenticated wallet address must be a valid EVM address',
    );
    const requestKey = this.normalizeRequestKey(body);
    const onChainAmount = this.toTokenBaseUnits(amount, token.decimals);
    const payload = {
      userId,
      chainId: token.chainId,
      tokenAddress: token.tokenAddress.toLowerCase(),
      assetId: token.assetId,
      amount,
      recipientAddress: recipientAddress.toLowerCase(),
    };
    const payloadHash = this.hashPayload(payload);
    const idempotencyKey = requestKey
      ? `web3:withdraw:${userId}:${requestKey}`
      : `web3:withdraw:${userId}:${randomUUID()}`;

    return {
      ...payload,
      tokenAddress: token.tokenAddress,
      recipientAddress,
      onChainAmount,
      payloadHash,
      idempotencyKey,
      ledgerDebitIdempotencyKey: `${idempotencyKey}:ledger`,
      walletOrderId: this.getWalletOrderId(userId),
    };
  }

  private async assertSufficientAvailableBalance(
    request: ReturnType<Web3WithdrawService['buildWithdrawRequest']>,
  ): Promise<void> {
    const balance = await this.orderBalanceRepository.findOne({
      where: {
        orderId: request.walletOrderId,
        userId: request.userId,
        assetId: request.assetId,
      },
    });
    const available = new BigNumber(balance?.available || 0);

    if (available.isLessThan(request.amount)) {
      throw this.badRequest(
        'INSUFFICIENT_AVAILABLE_BALANCE',
        'withdraw amount exceeds available wallet balance',
      );
    }
  }

  private assertIdempotentReplay(
    existing: Web3Withdrawal,
    payloadHash: string,
  ): void {
    if (existing.payloadHash !== payloadHash) {
      throw new ConflictException({
        code: 'WITHDRAW_IDEMPOTENCY_CONFLICT',
        message: 'withdraw idempotency key was reused with a different payload',
      });
    }
  }

  private normalizeRequestKey(body: WithdrawBody): string {
    return String(
      body?.idempotencyKey || body?.clientRequestId || body?.requestId || '',
    ).trim();
  }

  private normalizeAddress(
    addressInput: unknown,
    code: string,
    message: string,
  ): string {
    try {
      return ethers.utils.getAddress(String(addressInput || '').trim());
    } catch {
      throw this.badRequest(code, message);
    }
  }

  private normalizeHumanAmount(amountInput?: unknown): string {
    const amount = new BigNumber(String(amountInput || '').trim());

    if (!amount.isFinite() || amount.isLessThanOrEqualTo(0)) {
      throw this.badRequest(
        'AMOUNT_INVALID',
        'amount must be a positive numeric string',
      );
    }

    return amount.toFixed();
  }

  private toTokenBaseUnits(amount: string, decimals: number) {
    try {
      return ethers.utils.parseUnits(amount, decimals);
    } catch {
      throw this.badRequest(
        'AMOUNT_INVALID',
        `amount must fit ${decimals} token decimals`,
      );
    }
  }

  private hashPayload(payload: Record<string, unknown>): string {
    return createHash('sha256')
      .update(this.stableStringify(payload))
      .digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableStringify(entry)).join(',')}]`;
    }

    const objectValue = value as Record<string, unknown>;

    return `{${Object.keys(objectValue)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${this.stableStringify(objectValue[key])}`,
      )
      .join(',')}}`;
  }

  private async withRequestLock<T>(
    idempotencyKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const currentTail =
      this.requestLocks.get(idempotencyKey) || Promise.resolve();
    let releaseCurrent: () => void = () => {};
    const nextTail = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const chainedTail = currentTail.then(() => nextTail);

    this.requestLocks.set(idempotencyKey, chainedTail);
    await currentTail;

    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (this.requestLocks.get(idempotencyKey) === chainedTail) {
        this.requestLocks.delete(idempotencyKey);
      }
    }
  }

  private getWalletOrderId(userId: string): string {
    return `${WEB3_WALLET_ORDER_PREFIX}:${userId}`;
  }

  private normalizeFailureReason(error: unknown): string {
    const message =
      error instanceof Error ? error.message : String(error || 'unknown error');

    return message.slice(0, 500);
  }

  private serializeResponse(
    withdrawal: Web3Withdrawal,
    balance?: MarketMakingOrderBalance,
  ) {
    const serializedWithdrawal = this.serializeWithdrawal(withdrawal);

    return {
      namespace: WEB3_WITHDRAW_NAMESPACE,
      withdrawalId: withdrawal.withdrawalId,
      status: withdrawal.status,
      txHash: withdrawal.txHash || null,
      failureReason: withdrawal.failureReason || null,
      withdrawal: serializedWithdrawal,
      balance: balance ? this.serializeBalance(balance) : null,
    };
  }

  private serializeWithdrawal(withdrawal: Web3Withdrawal) {
    return {
      withdrawalId: withdrawal.withdrawalId,
      userId: withdrawal.userId,
      chainId: withdrawal.chainId,
      tokenAddress: withdrawal.tokenAddress,
      assetId: withdrawal.assetId,
      amount: withdrawal.amount,
      recipientAddress: withdrawal.recipientAddress,
      status: withdrawal.status as Web3WithdrawalStatus,
      txHash: withdrawal.txHash || null,
      failureReason: withdrawal.failureReason || null,
      ledgerEntryId: withdrawal.ledgerEntryId || null,
      idempotencyKey: withdrawal.idempotencyKey,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
    };
  }

  private serializeBalance(balance: MarketMakingOrderBalance) {
    return {
      orderId: balance.orderId,
      assetId: balance.assetId,
      available: balance.available,
      locked: balance.locked,
      total: balance.total,
      initialDeposit: balance.initialDeposit,
      realizedDelta: balance.realizedDelta,
      feePaid: balance.feePaid,
      updatedAt: balance.updatedAt,
    };
  }

  private badRequest(code: string, message: string) {
    return new BadRequestException({
      code,
      message,
      timestamp: getRFC3339Timestamp(),
    });
  }
}
