import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { createHash, randomBytes } from 'crypto';
import { ethers } from 'ethers';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { Web3EventLog } from 'src/common/entities/web3/web3-event-log.entity';
import {
  Web3Withdrawal,
  Web3WithdrawalStatus,
} from 'src/common/entities/web3/web3-withdrawal.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { BalanceLedgerService } from 'src/modules/market-making/ledger/balance-ledger.service';
import { UserOrdersService } from 'src/modules/market-making/user-orders/user-orders.service';
import { Repository } from 'typeorm';

import { MR_MARKET_ROUTER_ABI } from '../contracts/mr-market-router.abi';
import { Web3DepositService } from '../deposit/web3-deposit.service';
import { Web3Service } from '../web3.service';

type WithdrawalRequestBody = {
  orderId?: unknown;
  chainId?: unknown;
  routerAddress?: unknown;
  tokenAddress?: unknown;
  amount?: unknown;
  recipientAddress?: unknown;
  idempotencyKey?: unknown;
  clientRequestId?: unknown;
  requestId?: unknown;
};

type VerifyWithdrawalBody = {
  txHash?: unknown;
};

export type WithdrawalRequestedEvent = {
  chainId?: unknown;
  requestId?: unknown;
  user?: unknown;
  token?: unknown;
  amount?: unknown;
  recipient?: unknown;
  payloadHash?: unknown;
  routerAddress?: unknown;
  txHash?: unknown;
  logIndex?: unknown;
  blockNumber?: unknown;
};

const WEB3_WITHDRAW_NAMESPACE = '/web3/withdrawal-requests';
const WITHDRAWAL_REQUEST_TTL_MS = 30 * 60 * 1000;
const ROUTER_INTERFACE = new ethers.utils.Interface([...MR_MARKET_ROUTER_ABI]);

@Injectable()
export class Web3WithdrawService {
  private readonly requestLocks = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(Web3Withdrawal)
    private readonly withdrawalRepository: Repository<Web3Withdrawal>,
    @InjectRepository(MarketMakingOrderBalance)
    private readonly orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    @InjectRepository(Web3EventLog)
    private readonly eventLogRepository: Repository<Web3EventLog>,
    private readonly web3Service: Web3Service,
    private readonly web3DepositService: Web3DepositService,
    private readonly balanceLedgerService: BalanceLedgerService,
    private readonly userOrdersService: UserOrdersService,
  ) {}

  async createWithdrawalRequest(
    userId: string,
    authenticatedAddress: string,
    body: WithdrawalRequestBody,
  ) {
    const request = await this.buildWithdrawalRequest(
      userId,
      authenticatedAddress,
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
        withdrawalId: request.requestId,
        userId,
        orderId: request.orderId,
        chainId: request.chainId,
        routerAddress: request.routerAddress,
        tokenAddress: request.tokenAddress,
        assetId: request.assetId,
        amount: request.amount,
        recipientAddress: request.recipientAddress,
        feeTokenAddress: request.feeTokenAddress,
        feeAssetId: request.feeAssetId,
        feeAmount: request.feeAmount,
        status: 'created',
        startBlockNumber: request.startBlockNumber,
        idempotencyKey: request.idempotencyKey,
        payloadHash: request.payloadHash,
        requestSecret: request.requestSecret,
        ledgerDebitIdempotencyKey: request.ledgerDebitIdempotencyKey,
        feeDebitIdempotencyKey: request.feeDebitIdempotencyKey,
        createdAt: now,
        expiresAt: request.expiresAt,
        updatedAt: now,
      });

      await this.withdrawalRepository.save(withdrawal);

      return this.serializeResponse(withdrawal);
    });
  }

  async getWithdrawal(userId: string, withdrawalId: string) {
    const withdrawal = await this.loadWithdrawal(withdrawalId);

    if (withdrawal.userId !== userId) {
      throw new ForbiddenException('Withdrawal belongs to a different user');
    }

    return this.serializeResponse(withdrawal);
  }

  async verifyWithdrawalTransaction(
    userId: string,
    withdrawalIdInput: string,
    body: VerifyWithdrawalBody,
  ) {
    const withdrawal = await this.loadWithdrawal(withdrawalIdInput);

    if (withdrawal.userId !== userId) {
      throw new ForbiddenException('Withdrawal belongs to a different user');
    }

    const txHash = this.normalizeBytes32(
      body?.txHash,
      'TX_HASH_INVALID',
      'txHash must be bytes32 hex',
    );
    const receipt = await this.web3Service.getTransactionReceipt(
      withdrawal.chainId,
      txHash,
    );

    if (!receipt || receipt.status !== 1) {
      throw this.badRequest(
        'WITHDRAWAL_TX_NOT_CONFIRMED',
        'withdrawal request transaction is not confirmed successfully',
      );
    }

    return await this.recordWithdrawalRequestedEvent(
      this.extractWithdrawalRequestedEvent(withdrawal, receipt),
    );
  }

  async recordWithdrawalRequestedEvent(event: WithdrawalRequestedEvent) {
    const normalized = this.normalizeWithdrawalRequestedEvent(event);
    const existingEvent = await this.eventLogRepository.findOne({
      where: {
        chainId: normalized.chainId,
        txHash: normalized.txHash,
        logIndex: normalized.logIndex,
      },
    });

    if (existingEvent) {
      const existingWithdrawal = await this.loadWithdrawal(normalized.requestId);

      return this.serializeEventResponse(existingWithdrawal, false);
    }

    const withdrawal = await this.loadWithdrawal(normalized.requestId);
    this.assertWithdrawalEventMatchesRequest(withdrawal, normalized);

    const now = getRFC3339Timestamp();
    withdrawal.status = 'onchain_seen';
    withdrawal.requestTxHash = normalized.txHash;
    withdrawal.requestLogIndex = normalized.logIndex;
    withdrawal.updatedAt = now;
    await this.withdrawalRepository.save(withdrawal);
    await this.eventLogRepository.save(
      this.eventLogRepository.create({
        chainId: normalized.chainId,
        contractAddress: normalized.routerAddress,
        eventName: 'WithdrawalRequested',
        txHash: normalized.txHash,
        logIndex: normalized.logIndex,
        blockNumber: normalized.blockNumber,
        payloadJson: normalized,
        processedAt: now,
        createdAt: now,
      }),
    );

    const balance = await this.applyLedgerDebitsAndPayout(withdrawal);

    return {
      ...this.serializeEventResponse(withdrawal, true),
      balance: balance ? this.serializeBalance(balance) : null,
    };
  }

  private async buildWithdrawalRequest(
    userId: string,
    authenticatedAddressInput: string,
    body: WithdrawalRequestBody,
  ) {
    const orderId = String(body?.orderId || '').trim();
    if (!orderId) {
      throw this.badRequest('ORDER_ID_REQUIRED', 'orderId is required');
    }
    const order = await this.userOrdersService.findOwnedMarketMakingByOrderId(
      userId,
      orderId,
    );
    if (!order || order.source === 'admin_direct') {
      throw new NotFoundException('Market making order not found');
    }

    const token = this.web3DepositService.resolveSupportedTokenForChain(
      body?.chainId,
      body?.tokenAddress,
    );
    const userAddress = this.normalizeAddress(
      authenticatedAddressInput,
      'USER_ADDRESS_INVALID',
      'authenticated wallet address must be a valid EVM address',
    );
    const routerAddress = this.normalizeAddress(
      body?.routerAddress,
      'ROUTER_ADDRESS_INVALID',
      'routerAddress must be a valid EVM address',
    );
    const recipientAddress = this.normalizeAddress(
      body?.recipientAddress || authenticatedAddressInput,
      'RECIPIENT_ADDRESS_INVALID',
      'recipientAddress must be a valid EVM address',
    );
    const amount = this.normalizeHumanAmount(body?.amount);
    const onChainAmount = this.toTokenBaseUnits(amount, token.decimals);
    const requestKey = this.normalizeRequestKey(body);
    const idempotencyKey = requestKey
      ? `web3:withdrawal-request:${userId}:${requestKey}`
      : `web3:withdrawal-request:${userId}:${ethers.utils.hexlify(randomBytes(32))}`;
    const requestId = requestKey
      ? this.hashPayload({ type: 'withdrawal_request_id', idempotencyKey })
      : ethers.utils.hexlify(randomBytes(32));
    const requestSecret = requestKey
      ? this.hashPayload({ type: 'withdrawal_request_secret', idempotencyKey })
      : ethers.utils.hexlify(randomBytes(32));
    const feeAmount = '0';
    const expiresAt = new Date(
      Date.now() + WITHDRAWAL_REQUEST_TTL_MS,
    ).toISOString();
    const startBlockNumber = await this.web3Service.getCurrentBlockNumber(
      token.chainId,
    );
    const payloadHash = this.hashPayload({
      chainId: token.chainId,
      routerAddress: routerAddress.toLowerCase(),
      userEvmAddress: userAddress.toLowerCase(),
      orderId,
      tokenAddress: token.tokenAddress.toLowerCase(),
      amount,
      recipientAddress: recipientAddress.toLowerCase(),
      requestId,
      requestSecret,
    });

    return {
      requestId,
      userId,
      orderId,
      chainId: token.chainId,
      routerAddress,
      userAddress,
      tokenAddress: token.tokenAddress,
      assetId: token.assetId,
      amount,
      onChainAmount,
      recipientAddress,
      feeTokenAddress: token.tokenAddress,
      feeAssetId: token.assetId,
      feeAmount,
      startBlockNumber,
      payloadHash,
      requestSecret,
      idempotencyKey,
      ledgerDebitIdempotencyKey: `${idempotencyKey}:ledger`,
      feeDebitIdempotencyKey: `${idempotencyKey}:fee`,
      expiresAt,
    };
  }

  private async applyLedgerDebitsAndPayout(withdrawal: Web3Withdrawal) {
    withdrawal.status = 'processing';
    withdrawal.updatedAt = getRFC3339Timestamp();
    await this.withdrawalRepository.save(withdrawal);

    const ledgerResult = await this.balanceLedgerService.debitWithdrawal({
      orderId: withdrawal.orderId,
      userId: withdrawal.userId,
      assetId: withdrawal.assetId,
      amount: withdrawal.amount,
      idempotencyKey: withdrawal.ledgerDebitIdempotencyKey,
      refType: 'web3_order_withdrawal',
      refId: withdrawal.withdrawalId,
    });
    withdrawal.ledgerEntryId = ledgerResult.entry.entryId;

    const feeAmount = new BigNumber(withdrawal.feeAmount || 0);
    if (feeAmount.isGreaterThan(0)) {
      const feeResult = await this.balanceLedgerService.debitFee({
        orderId: withdrawal.orderId,
        userId: withdrawal.userId,
        assetId: withdrawal.feeAssetId,
        amount: withdrawal.feeAmount,
        idempotencyKey: withdrawal.feeDebitIdempotencyKey,
        refType: 'web3_order_withdrawal_fee',
        refId: withdrawal.withdrawalId,
      });
      withdrawal.feeLedgerEntryId = feeResult.entry.entryId;
    }

    await this.trySubmitPayout(withdrawal);
    withdrawal.updatedAt = getRFC3339Timestamp();
    await this.withdrawalRepository.save(withdrawal);

    return ledgerResult.balance;
  }

  private async trySubmitPayout(withdrawal: Web3Withdrawal): Promise<void> {
    const signer = this.web3Service.getSigner(withdrawal.chainId);

    if (!signer?.provider) {
      withdrawal.status = 'blocked';
      withdrawal.failureReason = `Web3 signer is not configured for chain ${withdrawal.chainId}`;

      return;
    }

    try {
      const token = this.web3DepositService.resolveSupportedTokenForChain(
        withdrawal.chainId,
        withdrawal.tokenAddress,
      );
      const transfer = await this.web3Service.transferErc20(
        withdrawal.chainId,
        withdrawal.tokenAddress,
        withdrawal.recipientAddress,
        this.toTokenBaseUnits(withdrawal.amount, token.decimals),
      );

      withdrawal.status = 'submitted';
      withdrawal.payoutTxHash = transfer.txHash;
      withdrawal.failureReason = undefined;
    } catch (error) {
      withdrawal.status = 'failed';
      withdrawal.failureReason = this.normalizeFailureReason(error);
    }
  }

  private extractWithdrawalRequestedEvent(
    withdrawal: Web3Withdrawal,
    receipt: ethers.providers.TransactionReceipt,
  ): WithdrawalRequestedEvent {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== withdrawal.routerAddress.toLowerCase()) {
        continue;
      }

      try {
        const parsed = ROUTER_INTERFACE.parseLog(log);
        if (parsed.name !== 'WithdrawalRequested') {
          continue;
        }
        if (
          String(parsed.args.requestId).toLowerCase() !==
          withdrawal.withdrawalId.toLowerCase()
        ) {
          continue;
        }

        return {
          chainId: withdrawal.chainId,
          requestId: parsed.args.requestId,
          user: parsed.args.user,
          token: parsed.args.token,
          amount: parsed.args.amount.toString(),
          recipient: parsed.args.recipient,
          payloadHash: parsed.args.payloadHash,
          routerAddress: log.address,
          txHash: receipt.transactionHash,
          logIndex: log.logIndex,
          blockNumber: receipt.blockNumber,
        };
      } catch {
        continue;
      }
    }

    throw this.badRequest(
      'WITHDRAWAL_EVENT_NOT_FOUND',
      'transaction receipt does not contain a matching WithdrawalRequested event',
    );
  }

  private assertWithdrawalEventMatchesRequest(
    withdrawal: Web3Withdrawal,
    event: ReturnType<Web3WithdrawService['normalizeWithdrawalRequestedEvent']>,
  ) {
    if (withdrawal.status !== 'created') {
      throw new ConflictException({
        code: 'WITHDRAWAL_REQUEST_ALREADY_PROCESSED',
        message: 'withdrawal request is not waiting for a Router event',
      });
    }
    if (new Date(withdrawal.expiresAt).getTime() < Date.now()) {
      withdrawal.status = 'expired';
      withdrawal.updatedAt = getRFC3339Timestamp();
      void this.withdrawalRepository.save(withdrawal);
      throw this.badRequest(
        'WITHDRAWAL_REQUEST_EXPIRED',
        'withdrawal request expired',
      );
    }
    if (withdrawal.chainId !== event.chainId) {
      throw this.badRequest(
        'WITHDRAWAL_CHAIN_MISMATCH',
        'event chain does not match request',
      );
    }
    if (withdrawal.routerAddress.toLowerCase() !== event.routerAddress.toLowerCase()) {
      throw this.badRequest(
        'WITHDRAWAL_ROUTER_MISMATCH',
        'event router does not match request',
      );
    }
    if (withdrawal.tokenAddress.toLowerCase() !== event.token.toLowerCase()) {
      throw this.badRequest(
        'WITHDRAWAL_TOKEN_MISMATCH',
        'event token does not match request',
      );
    }
    if (withdrawal.recipientAddress.toLowerCase() !== event.recipient.toLowerCase()) {
      throw this.badRequest(
        'WITHDRAWAL_RECIPIENT_MISMATCH',
        'event recipient does not match request',
      );
    }
    if (withdrawal.payloadHash.toLowerCase() !== event.payloadHash.toLowerCase()) {
      throw this.badRequest(
        'WITHDRAWAL_PAYLOAD_MISMATCH',
        'event payload hash does not match request',
      );
    }
    const token = this.web3DepositService.resolveSupportedTokenForChain(
      withdrawal.chainId,
      withdrawal.tokenAddress,
    );
    if (!this.toTokenBaseUnits(withdrawal.amount, token.decimals).eq(event.amount)) {
      throw this.badRequest(
        'WITHDRAWAL_AMOUNT_MISMATCH',
        'event amount does not match request',
      );
    }
  }

  private async assertSufficientAvailableBalance(
    request: Awaited<ReturnType<Web3WithdrawService['buildWithdrawalRequest']>>,
  ): Promise<void> {
    const balance = await this.orderBalanceRepository.findOne({
      where: {
        orderId: request.orderId,
        userId: request.userId,
        assetId: request.assetId,
      },
    });
    const required = new BigNumber(request.amount).plus(request.feeAmount);
    const available = new BigNumber(balance?.available || 0);

    if (available.isLessThan(required)) {
      throw this.badRequest(
        'INSUFFICIENT_AVAILABLE_BALANCE',
        'withdraw amount plus fee exceeds available order balance',
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

  private normalizeWithdrawalRequestedEvent(event: WithdrawalRequestedEvent) {
    return {
      chainId: this.parsePositiveInteger(event.chainId, 'CHAIN_ID_INVALID', 'chainId is required'),
      requestId: this.normalizeBytes32(event.requestId, 'REQUEST_ID_INVALID', 'requestId must be bytes32 hex'),
      user: this.normalizeAddress(event.user, 'USER_ADDRESS_INVALID', 'event user must be a valid EVM address'),
      token: this.normalizeAddress(event.token, 'TOKEN_ADDRESS_INVALID', 'event token must be a valid EVM address'),
      amount: this.normalizeBaseUnitAmount(event.amount),
      recipient: this.normalizeAddress(event.recipient, 'RECIPIENT_ADDRESS_INVALID', 'event recipient must be a valid EVM address'),
      payloadHash: this.normalizeBytes32(event.payloadHash, 'PAYLOAD_HASH_INVALID', 'payloadHash must be bytes32 hex'),
      routerAddress: this.normalizeAddress(event.routerAddress, 'ROUTER_ADDRESS_INVALID', 'event router must be a valid EVM address'),
      txHash: this.normalizeBytes32(event.txHash, 'TX_HASH_INVALID', 'txHash must be bytes32 hex'),
      logIndex: this.parseNonNegativeInteger(event.logIndex, 'LOG_INDEX_INVALID', 'logIndex is required'),
      blockNumber:
        event.blockNumber === undefined || event.blockNumber === null
          ? undefined
          : this.parseNonNegativeInteger(event.blockNumber, 'BLOCK_NUMBER_INVALID', 'blockNumber must be non-negative'),
    };
  }

  private async loadWithdrawal(withdrawalIdInput: unknown) {
    const withdrawalId = this.normalizeBytes32(
      withdrawalIdInput,
      'WITHDRAWAL_ID_INVALID',
      'withdrawalId must be bytes32 hex',
    );
    const withdrawal = await this.withdrawalRepository.findOneBy({
      withdrawalId,
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }

    return withdrawal;
  }

  private normalizeRequestKey(body: WithdrawalRequestBody): string {
    return String(
      body?.idempotencyKey || body?.clientRequestId || body?.requestId || '',
    ).trim();
  }

  private normalizeAddress(addressInput: unknown, code: string, message: string) {
    try {
      return ethers.utils.getAddress(String(addressInput || '').trim());
    } catch {
      throw this.badRequest(code, message);
    }
  }

  private normalizeBytes32(valueInput: unknown, code: string, message: string) {
    const value = String(valueInput || '').trim().toLowerCase();

    if (!ethers.utils.isHexString(value, 32)) {
      throw this.badRequest(code, message);
    }

    return value;
  }

  private normalizeHumanAmount(amountInput?: unknown): string {
    const amount = new BigNumber(String(amountInput || '').trim());

    if (!amount.isFinite() || amount.isLessThanOrEqualTo(0)) {
      throw this.badRequest('AMOUNT_INVALID', 'amount must be a positive numeric string');
    }

    return amount.toFixed();
  }

  private normalizeBaseUnitAmount(amountInput?: unknown) {
    const amount = new BigNumber(String(amountInput || '').trim());

    if (!amount.isInteger() || amount.isLessThanOrEqualTo(0)) {
      throw this.badRequest('AMOUNT_INVALID', 'event amount must be a positive integer base-unit amount');
    }

    return ethers.BigNumber.from(amount.toFixed(0));
  }

  private parsePositiveInteger(valueInput: unknown, code: string, message: string) {
    const value = Number(valueInput);

    if (!Number.isInteger(value) || value <= 0) {
      throw this.badRequest(code, message);
    }

    return value;
  }

  private parseNonNegativeInteger(valueInput: unknown, code: string, message: string) {
    const value = Number(valueInput);

    if (!Number.isInteger(value) || value < 0) {
      throw this.badRequest(code, message);
    }

    return value;
  }

  private toTokenBaseUnits(amount: string, decimals: number) {
    try {
      return ethers.utils.parseUnits(amount, decimals);
    } catch {
      throw this.badRequest('AMOUNT_INVALID', `amount must fit ${decimals} token decimals`);
    }
  }

  private hashPayload(payload: unknown): string {
    return `0x${createHash('sha256').update(this.stableStringify(payload)).digest('hex')}`;
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
      .map((key) => `${JSON.stringify(key)}:${this.stableStringify(objectValue[key])}`)
      .join(',')}}`;
  }

  private async withRequestLock<T>(
    idempotencyKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const currentTail = this.requestLocks.get(idempotencyKey) || Promise.resolve();
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

  private normalizeFailureReason(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error || 'unknown error');

    return message.slice(0, 500);
  }

  private serializeEventResponse(withdrawal: Web3Withdrawal, applied: boolean) {
    return {
      namespace: WEB3_WITHDRAW_NAMESPACE,
      applied,
      ...this.serializeResponse(withdrawal),
    };
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
      requestTxHash: withdrawal.requestTxHash || null,
      payoutTxHash: withdrawal.payoutTxHash || null,
      txHash: withdrawal.payoutTxHash || null,
      failureReason: withdrawal.failureReason || null,
      withdrawal: serializedWithdrawal,
      routerCall:
        withdrawal.status === 'created'
          ? {
              functionName: 'requestWithdrawal' as const,
              routerAddress: withdrawal.routerAddress,
              requestId: withdrawal.withdrawalId,
              tokenAddress: withdrawal.tokenAddress,
              amount: withdrawal.amount,
              amountBaseUnits: this.toTokenBaseUnits(
                withdrawal.amount,
                this.web3DepositService.resolveSupportedTokenForChain(
                  withdrawal.chainId,
                  withdrawal.tokenAddress,
                ).decimals,
              ).toString(),
              recipientAddress: withdrawal.recipientAddress,
              payloadHash: withdrawal.payloadHash,
            }
          : null,
      balance: balance ? this.serializeBalance(balance) : null,
    };
  }

  private serializeWithdrawal(withdrawal: Web3Withdrawal) {
    return {
      withdrawalId: withdrawal.withdrawalId,
      userId: withdrawal.userId,
      orderId: withdrawal.orderId,
      chainId: withdrawal.chainId,
      routerAddress: withdrawal.routerAddress,
      tokenAddress: withdrawal.tokenAddress,
      assetId: withdrawal.assetId,
      amount: withdrawal.amount,
      recipientAddress: withdrawal.recipientAddress,
      feeTokenAddress: withdrawal.feeTokenAddress,
      feeAssetId: withdrawal.feeAssetId,
      feeAmount: withdrawal.feeAmount,
      status: withdrawal.status as Web3WithdrawalStatus,
      requestTxHash: withdrawal.requestTxHash || null,
      requestLogIndex: withdrawal.requestLogIndex ?? null,
      startBlockNumber: withdrawal.startBlockNumber ?? null,
      payoutTxHash: withdrawal.payoutTxHash || null,
      externalPayoutId: withdrawal.externalPayoutId || null,
      failureReason: withdrawal.failureReason || null,
      ledgerEntryId: withdrawal.ledgerEntryId || null,
      feeLedgerEntryId: withdrawal.feeLedgerEntryId || null,
      idempotencyKey: withdrawal.idempotencyKey,
      createdAt: withdrawal.createdAt,
      expiresAt: withdrawal.expiresAt,
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
