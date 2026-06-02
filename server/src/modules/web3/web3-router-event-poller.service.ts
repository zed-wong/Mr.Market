import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Web3FundingRequest } from 'src/common/entities/web3/web3-funding-request.entity';
import { Web3Withdrawal } from 'src/common/entities/web3/web3-withdrawal.entity';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';

import { MR_MARKET_ROUTER_ABI } from './contracts/mr-market-router.abi';
import { FundsRoutedEvent, Web3FundingService } from './funding/web3-funding.service';
import {
  Web3WithdrawService,
  WithdrawalRequestedEvent,
} from './withdraw/web3-withdraw.service';
import { Web3Service } from './web3.service';

@Injectable()
export class Web3RouterEventPollerService {
  private static readonly LOOKBACK_BLOCKS = 5_000;
  private static readonly MAX_REQUESTS_PER_PASS = 20;

  private readonly logger = new Logger(Web3RouterEventPollerService.name);
  private readonly routerInterface = new ethers.utils.Interface([
    ...MR_MARKET_ROUTER_ABI,
  ]);
  private running = false;

  constructor(
    @InjectRepository(Web3FundingRequest)
    private readonly fundingRequestRepository: Repository<Web3FundingRequest>,
    @InjectRepository(Web3Withdrawal)
    private readonly withdrawalRepository: Repository<Web3Withdrawal>,
    private readonly web3Service: Web3Service,
    private readonly web3FundingService: Web3FundingService,
    private readonly web3WithdrawService: Web3WithdrawService,
  ) {}

  @Cron('*/15 * * * * *')
  async pollRouterEvents(): Promise<number> {
    if (this.running) {
      return 0;
    }

    this.running = true;
    try {
      const fundingCount = await this.pollFundingRequests();
      const withdrawalCount = await this.pollWithdrawalRequests();

      return fundingCount + withdrawalCount;
    } catch (error) {
      this.logger.warn(
        `Router event polling failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return 0;
    } finally {
      this.running = false;
    }
  }

  private async pollFundingRequests(): Promise<number> {
    const requests = await this.fundingRequestRepository.find({
      where: { status: 'created' },
      order: { createdAt: 'ASC' },
      take: Web3RouterEventPollerService.MAX_REQUESTS_PER_PASS,
    });

    let processed = 0;
    for (const request of requests) {
      if (this.isExpired(request.expiresAt)) {
        continue;
      }
      processed += await this.pollFundingRequest(request);
    }

    return processed;
  }

  private async pollWithdrawalRequests(): Promise<number> {
    const requests = await this.withdrawalRepository.find({
      where: { status: 'created' },
      order: { createdAt: 'ASC' },
      take: Web3RouterEventPollerService.MAX_REQUESTS_PER_PASS,
    });

    let processed = 0;
    for (const request of requests) {
      if (this.isExpired(request.expiresAt)) {
        continue;
      }
      processed += await this.pollWithdrawalRequest(request);
    }

    return processed;
  }

  private async pollFundingRequest(
    request: Web3FundingRequest,
  ): Promise<number> {
    const latestBlock = await this.web3Service.getCurrentBlockNumber(
      request.chainId,
    );
    const logs = await this.web3Service.getLogs(request.chainId, {
      address: request.routerAddress,
      fromBlock: this.getFromBlock(request.startBlockNumber, latestBlock),
      toBlock: latestBlock,
      topics: [
        this.routerInterface.getEventTopic('FundsRouted'),
        request.requestId,
      ],
    });

    for (const log of logs) {
      const parsed = this.routerInterface.parseLog(log);
      await this.web3FundingService.recordFundsRoutedEvent({
        chainId: request.chainId,
        requestId: parsed.args.requestId,
        user: parsed.args.user,
        token: parsed.args.token,
        amount: parsed.args.amount.toString(),
        payloadHash: parsed.args.payloadHash,
        receiver: parsed.args.receiver,
        routerAddress: log.address,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
      } satisfies FundsRoutedEvent);

      return 1;
    }

    return 0;
  }

  private async pollWithdrawalRequest(
    request: Web3Withdrawal,
  ): Promise<number> {
    const latestBlock = await this.web3Service.getCurrentBlockNumber(
      request.chainId,
    );
    const logs = await this.web3Service.getLogs(request.chainId, {
      address: request.routerAddress,
      fromBlock: this.getFromBlock(request.startBlockNumber, latestBlock),
      toBlock: latestBlock,
      topics: [
        this.routerInterface.getEventTopic('WithdrawalRequested'),
        request.withdrawalId,
      ],
    });

    for (const log of logs) {
      const parsed = this.routerInterface.parseLog(log);
      await this.web3WithdrawService.recordWithdrawalRequestedEvent({
        chainId: request.chainId,
        requestId: parsed.args.requestId,
        user: parsed.args.user,
        token: parsed.args.token,
        amount: parsed.args.amount.toString(),
        recipient: parsed.args.recipient,
        payloadHash: parsed.args.payloadHash,
        routerAddress: log.address,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
      } satisfies WithdrawalRequestedEvent);

      return 1;
    }

    return 0;
  }

  private getFromBlock(startBlockNumber: number | undefined, latestBlock: number) {
    return Math.max(
      0,
      startBlockNumber ??
        latestBlock - Web3RouterEventPollerService.LOOKBACK_BLOCKS,
    );
  }

  private isExpired(expiresAt: string): boolean {
    return new Date(expiresAt).getTime() <= Date.now();
  }
}
