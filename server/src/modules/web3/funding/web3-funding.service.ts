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
import { Web3EventLog } from 'src/common/entities/web3/web3-event-log.entity';
import { Web3FundingRequest } from 'src/common/entities/web3/web3-funding-request.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { Repository } from 'typeorm';

import { MR_MARKET_ROUTER_ABI } from '../contracts/mr-market-router.abi';
import { Web3DepositService } from '../deposit/web3-deposit.service';
import { Web3MarketMakingService } from '../market-making/web3-market-making.service';
import { Web3Service } from '../web3.service';

type FundingRequestBody = {
  chainId?: unknown;
  routerAddress?: unknown;
  tokenAddress?: unknown;
  amount?: unknown;
  orderDraft?: unknown;
};

type VerifyFundingBody = {
  txHash?: unknown;
};

export type FundsRoutedEvent = {
  chainId?: unknown;
  requestId?: unknown;
  user?: unknown;
  token?: unknown;
  amount?: unknown;
  payloadHash?: unknown;
  receiver?: unknown;
  routerAddress?: unknown;
  txHash?: unknown;
  logIndex?: unknown;
  blockNumber?: unknown;
};

const WEB3_FUNDING_NAMESPACE = '/web3/funding-requests';
const FUNDING_REQUEST_TTL_MS = 30 * 60 * 1000;
const ROUTER_INTERFACE = new ethers.utils.Interface([...MR_MARKET_ROUTER_ABI]);

@Injectable()
export class Web3FundingService {
  constructor(
    @InjectRepository(Web3FundingRequest)
    private readonly fundingRequestRepository: Repository<Web3FundingRequest>,
    @InjectRepository(Web3EventLog)
    private readonly eventLogRepository: Repository<Web3EventLog>,
    private readonly web3DepositService: Web3DepositService,
    private readonly web3Service: Web3Service,
    private readonly web3MarketMakingService: Web3MarketMakingService,
  ) {}

  async createFundingRequest(
    userId: string,
    evmAddressInput: string,
    body: FundingRequestBody,
  ) {
    const token = this.web3DepositService.resolveSupportedTokenForChain(
      body?.chainId,
      body?.tokenAddress,
    );
    const evmAddress = this.normalizeAddress(
      evmAddressInput,
      'USER_ADDRESS_INVALID',
      'authenticated wallet address must be a valid EVM address',
    );
    const routerAddress = this.normalizeAddress(
      body?.routerAddress,
      'ROUTER_ADDRESS_INVALID',
      'routerAddress must be a valid EVM address',
    );
    const receiverAddress = this.web3Service.getOperatorAddress(token.chainId);
    const amount = this.normalizeHumanAmount(body?.amount);
    const amountBaseUnits = this.toTokenBaseUnits(amount, token.decimals);
    const orderDraftJson = this.normalizeOrderDraft(body?.orderDraft);
    const startBlockNumber = await this.web3Service.getCurrentBlockNumber(
      token.chainId,
    );
    const requestId = ethers.utils.hexlify(randomBytes(32));
    const requestSecret = ethers.utils.hexlify(randomBytes(32));
    const now = getRFC3339Timestamp();
    const expiresAt = new Date(
      Date.now() + FUNDING_REQUEST_TTL_MS,
    ).toISOString();
    const payloadHash = this.hashPayload({
      chainId: token.chainId,
      routerAddress: routerAddress.toLowerCase(),
      receiverAddress: receiverAddress.toLowerCase(),
      userEvmAddress: evmAddress.toLowerCase(),
      tokenAddress: token.tokenAddress.toLowerCase(),
      amount,
      requestId,
      orderDraftHash: this.hashPayload(orderDraftJson),
      requestSecret,
    });
    const fundingRequest = this.fundingRequestRepository.create({
      requestId,
      userId,
      evmAddress,
      chainId: token.chainId,
      routerAddress,
      receiverAddress,
      tokenAddress: token.tokenAddress,
      assetId: token.assetId,
      amount,
      payloadHash,
      requestSecret,
      orderDraftJson,
      status: 'created',
      startBlockNumber,
      createdAt: now,
      expiresAt,
      updatedAt: now,
    });

    await this.fundingRequestRepository.save(fundingRequest);

    return {
      namespace: WEB3_FUNDING_NAMESPACE,
      fundingRequest: this.serializeFundingRequest(fundingRequest),
      routerCall: {
        functionName: 'routeFunds',
        routerAddress,
        requestId,
        tokenAddress: token.tokenAddress,
        amount,
        amountBaseUnits: amountBaseUnits.toString(),
        payloadHash,
      },
    };
  }

  async getFundingRequest(userId: string, requestId: string) {
    const fundingRequest = await this.loadFundingRequest(requestId);

    if (fundingRequest.userId !== userId) {
      throw new ForbiddenException(
        'Funding request belongs to a different user',
      );
    }

    return {
      namespace: WEB3_FUNDING_NAMESPACE,
      fundingRequest: this.serializeFundingRequest(fundingRequest),
    };
  }

  async verifyFundingTransaction(
    userId: string,
    requestIdInput: string,
    body: VerifyFundingBody,
  ) {
    const fundingRequest = await this.loadFundingRequest(requestIdInput);

    if (fundingRequest.userId !== userId) {
      throw new ForbiddenException(
        'Funding request belongs to a different user',
      );
    }

    const txHash = this.normalizeBytes32(
      body?.txHash,
      'TX_HASH_INVALID',
      'txHash must be bytes32 hex',
    );
    const receipt = await this.web3Service.getTransactionReceipt(
      fundingRequest.chainId,
      txHash,
    );

    if (!receipt || receipt.status !== 1) {
      throw this.badRequest(
        'FUNDING_TX_NOT_CONFIRMED',
        'funding transaction is not confirmed successfully',
      );
    }

    const routedEvent = this.extractFundsRoutedEvent(fundingRequest, receipt);

    return await this.recordFundsRoutedEvent(routedEvent);
  }

  async recordFundsRoutedEvent(event: FundsRoutedEvent) {
    const normalized = this.normalizeFundsRoutedEvent(event);
    const existingEvent = await this.eventLogRepository.findOne({
      where: {
        chainId: normalized.chainId,
        txHash: normalized.txHash,
        logIndex: normalized.logIndex,
      },
    });

    if (existingEvent) {
      const existingRequest = await this.loadFundingRequest(
        normalized.requestId,
      );

      return this.serializeEventResult(existingRequest, false);
    }

    const fundingRequest = await this.loadFundingRequest(normalized.requestId);

    this.assertFundingEventMatchesRequest(fundingRequest, normalized);

    const now = getRFC3339Timestamp();

    fundingRequest.status = 'onchain_seen';
    fundingRequest.txHash = normalized.txHash;
    fundingRequest.logIndex = normalized.logIndex;
    fundingRequest.updatedAt = now;
    await this.fundingRequestRepository.save(fundingRequest);
    await this.eventLogRepository.save(
      this.eventLogRepository.create({
        chainId: normalized.chainId,
        contractAddress: normalized.routerAddress,
        eventName: 'FundsRouted',
        txHash: normalized.txHash,
        logIndex: normalized.logIndex,
        blockNumber: normalized.blockNumber,
        payloadJson: normalized,
        processedAt: now,
        createdAt: now,
      }),
    );

    const orderResult = await this.web3MarketMakingService.createOrder(
      fundingRequest.userId,
      {
        ...(fundingRequest.orderDraftJson || {}),
        initialDeposit: {
          assetId: fundingRequest.assetId,
          amount: fundingRequest.amount,
        },
        requestId: fundingRequest.requestId,
      },
    );

    fundingRequest.status = 'order_created';
    fundingRequest.orderId = orderResult.orderId;
    fundingRequest.updatedAt = getRFC3339Timestamp();
    await this.fundingRequestRepository.save(fundingRequest);

    return this.serializeEventResult(fundingRequest, true);
  }

  private extractFundsRoutedEvent(
    fundingRequest: Web3FundingRequest,
    receipt: ethers.providers.TransactionReceipt,
  ): FundsRoutedEvent {
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() !== fundingRequest.routerAddress.toLowerCase()
      ) {
        continue;
      }

      try {
        const parsed = ROUTER_INTERFACE.parseLog(log);

        if (parsed.name !== 'FundsRouted') {
          continue;
        }
        if (
          String(parsed.args.requestId).toLowerCase() !==
          fundingRequest.requestId.toLowerCase()
        ) {
          continue;
        }

        return {
          chainId: fundingRequest.chainId,
          requestId: parsed.args.requestId,
          user: parsed.args.user,
          token: parsed.args.token,
          amount: parsed.args.amount.toString(),
          payloadHash: parsed.args.payloadHash,
          receiver: parsed.args.receiver,
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
      'FUNDING_EVENT_NOT_FOUND',
      'transaction receipt does not contain a matching FundsRouted event',
    );
  }

  private assertFundingEventMatchesRequest(
    fundingRequest: Web3FundingRequest,
    event: ReturnType<Web3FundingService['normalizeFundsRoutedEvent']>,
  ) {
    if (fundingRequest.status !== 'created') {
      throw new ConflictException({
        code: 'FUNDING_REQUEST_ALREADY_PROCESSED',
        message: 'funding request is not waiting for a Router event',
      });
    }
    if (new Date(fundingRequest.expiresAt).getTime() < Date.now()) {
      fundingRequest.status = 'expired';
      fundingRequest.updatedAt = getRFC3339Timestamp();
      void this.fundingRequestRepository.save(fundingRequest);
      throw this.badRequest(
        'FUNDING_REQUEST_EXPIRED',
        'funding request expired',
      );
    }
    if (fundingRequest.chainId !== event.chainId) {
      throw this.badRequest(
        'FUNDING_CHAIN_MISMATCH',
        'event chain does not match request',
      );
    }
    if (
      fundingRequest.routerAddress.toLowerCase() !==
      event.routerAddress.toLowerCase()
    ) {
      throw this.badRequest(
        'FUNDING_ROUTER_MISMATCH',
        'event router does not match request',
      );
    }
    if (fundingRequest.evmAddress.toLowerCase() !== event.user.toLowerCase()) {
      throw this.badRequest(
        'FUNDING_USER_MISMATCH',
        'event user does not match request',
      );
    }
    if (
      fundingRequest.tokenAddress.toLowerCase() !== event.token.toLowerCase()
    ) {
      throw this.badRequest(
        'FUNDING_TOKEN_MISMATCH',
        'event token does not match request',
      );
    }
    if (
      fundingRequest.receiverAddress.toLowerCase() !==
      event.receiver.toLowerCase()
    ) {
      throw this.badRequest(
        'FUNDING_RECEIVER_MISMATCH',
        'event receiver does not match request',
      );
    }
    if (
      fundingRequest.payloadHash.toLowerCase() !==
      event.payloadHash.toLowerCase()
    ) {
      throw this.badRequest(
        'FUNDING_PAYLOAD_MISMATCH',
        'event payload hash does not match request',
      );
    }
    const expectedBaseUnits = this.toTokenBaseUnits(
      fundingRequest.amount,
      this.web3DepositService.resolveSupportedTokenForChain(
        fundingRequest.chainId,
        fundingRequest.tokenAddress,
      ).decimals,
    );

    if (!expectedBaseUnits.eq(event.amount)) {
      throw this.badRequest(
        'FUNDING_AMOUNT_MISMATCH',
        'event amount does not match request',
      );
    }
  }

  private normalizeFundsRoutedEvent(event: FundsRoutedEvent) {
    return {
      chainId: this.parsePositiveInteger(
        event.chainId,
        'CHAIN_ID_INVALID',
        'chainId is required',
      ),
      requestId: this.normalizeBytes32(
        event.requestId,
        'REQUEST_ID_INVALID',
        'requestId must be bytes32 hex',
      ),
      user: this.normalizeAddress(
        event.user,
        'USER_ADDRESS_INVALID',
        'event user must be a valid EVM address',
      ),
      token: this.normalizeAddress(
        event.token,
        'TOKEN_ADDRESS_INVALID',
        'event token must be a valid EVM address',
      ),
      amount: this.normalizeBaseUnitAmount(event.amount),
      payloadHash: this.normalizeBytes32(
        event.payloadHash,
        'PAYLOAD_HASH_INVALID',
        'payloadHash must be bytes32 hex',
      ),
      receiver: this.normalizeAddress(
        event.receiver,
        'RECEIVER_ADDRESS_INVALID',
        'event receiver must be a valid EVM address',
      ),
      routerAddress: this.normalizeAddress(
        event.routerAddress,
        'ROUTER_ADDRESS_INVALID',
        'event router must be a valid EVM address',
      ),
      txHash: this.normalizeBytes32(
        event.txHash,
        'TX_HASH_INVALID',
        'txHash must be bytes32 hex',
      ),
      logIndex: this.parseNonNegativeInteger(
        event.logIndex,
        'LOG_INDEX_INVALID',
        'logIndex is required',
      ),
      blockNumber:
        event.blockNumber === undefined || event.blockNumber === null
          ? undefined
          : this.parseNonNegativeInteger(
              event.blockNumber,
              'BLOCK_NUMBER_INVALID',
              'blockNumber must be non-negative',
            ),
    };
  }

  private async loadFundingRequest(requestIdInput: unknown) {
    const requestId = this.normalizeBytes32(
      requestIdInput,
      'REQUEST_ID_INVALID',
      'requestId must be bytes32 hex',
    );
    const fundingRequest = await this.fundingRequestRepository.findOne({
      where: { requestId },
    });

    if (!fundingRequest) {
      throw new NotFoundException('Funding request not found');
    }

    return fundingRequest;
  }

  private normalizeOrderDraft(
    orderDraftInput: unknown,
  ): Record<string, unknown> {
    if (
      !orderDraftInput ||
      typeof orderDraftInput !== 'object' ||
      Array.isArray(orderDraftInput)
    ) {
      throw this.badRequest(
        'ORDER_DRAFT_INVALID',
        'orderDraft must be an object',
      );
    }

    return orderDraftInput as Record<string, unknown>;
  }

  private normalizeAddress(
    addressInput: unknown,
    code: string,
    message: string,
  ) {
    try {
      return ethers.utils.getAddress(String(addressInput || '').trim());
    } catch {
      throw this.badRequest(code, message);
    }
  }

  private normalizeBytes32(valueInput: unknown, code: string, message: string) {
    const value = String(valueInput || '')
      .trim()
      .toLowerCase();

    if (!ethers.utils.isHexString(value, 32)) {
      throw this.badRequest(code, message);
    }

    return value;
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

  private normalizeBaseUnitAmount(amountInput?: unknown) {
    const amount = new BigNumber(String(amountInput || '').trim());

    if (!amount.isInteger() || amount.isLessThanOrEqualTo(0)) {
      throw this.badRequest(
        'AMOUNT_INVALID',
        'event amount must be a positive integer base-unit amount',
      );
    }

    return ethers.BigNumber.from(amount.toFixed(0));
  }

  private parsePositiveInteger(
    valueInput: unknown,
    code: string,
    message: string,
  ) {
    const value = Number(valueInput);

    if (!Number.isInteger(value) || value <= 0) {
      throw this.badRequest(code, message);
    }

    return value;
  }

  private parseNonNegativeInteger(
    valueInput: unknown,
    code: string,
    message: string,
  ) {
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
      throw this.badRequest(
        'AMOUNT_INVALID',
        `amount must fit ${decimals} token decimals`,
      );
    }
  }

  private hashPayload(payload: unknown): string {
    return `0x${createHash('sha256')
      .update(this.stableStringify(payload))
      .digest('hex')}`;
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

  private serializeEventResult(
    fundingRequest: Web3FundingRequest,
    applied: boolean,
  ) {
    return {
      namespace: WEB3_FUNDING_NAMESPACE,
      applied,
      fundingRequest: this.serializeFundingRequest(fundingRequest),
    };
  }

  private serializeFundingRequest(fundingRequest: Web3FundingRequest) {
    return {
      requestId: fundingRequest.requestId,
      userId: fundingRequest.userId,
      evmAddress: fundingRequest.evmAddress,
      chainId: fundingRequest.chainId,
      routerAddress: fundingRequest.routerAddress,
      receiverAddress: fundingRequest.receiverAddress,
      tokenAddress: fundingRequest.tokenAddress,
      assetId: fundingRequest.assetId,
      amount: fundingRequest.amount,
      payloadHash: fundingRequest.payloadHash,
      orderDraft: fundingRequest.orderDraftJson,
      status: fundingRequest.status,
      txHash: fundingRequest.txHash || null,
      logIndex: fundingRequest.logIndex ?? null,
      startBlockNumber: fundingRequest.startBlockNumber ?? null,
      orderId: fundingRequest.orderId || null,
      rejectionReason: fundingRequest.rejectionReason || null,
      createdAt: fundingRequest.createdAt,
      expiresAt: fundingRequest.expiresAt,
      updatedAt: fundingRequest.updatedAt,
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
