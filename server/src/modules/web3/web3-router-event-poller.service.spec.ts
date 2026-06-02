import { ethers } from 'ethers';

import { MR_MARKET_ROUTER_ABI } from './contracts/mr-market-router.abi';
import { Web3RouterEventPollerService } from './web3-router-event-poller.service';

describe('Web3RouterEventPollerService', () => {
  const routerInterface = new ethers.utils.Interface([...MR_MARKET_ROUTER_ABI]);
  const routerAddress = '0x2222222222222222222222222222222222222222';
  const userAddress = '0x1111111111111111111111111111111111111111';
  const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const receiverAddress = '0x3333333333333333333333333333333333333333';
  const recipientAddress = '0x4444444444444444444444444444444444444444';
  const requestId = `0x${'a'.repeat(64)}`;
  const withdrawalId = `0x${'b'.repeat(64)}`;
  const payloadHash = `0x${'c'.repeat(64)}`;

  it('polls pending Router requests and processes matching events idempotently through services', async () => {
    const fundingLog = buildLog(
      'FundsRouted',
      [
        requestId,
        userAddress,
        tokenAddress,
        ethers.utils.parseUnits('12.34', 6),
        payloadHash,
        receiverAddress,
      ],
      `0x${'d'.repeat(64)}`,
      2,
    );
    const withdrawalLog = buildLog(
      'WithdrawalRequested',
      [
        withdrawalId,
        userAddress,
        tokenAddress,
        ethers.utils.parseUnits('2.5', 6),
        recipientAddress,
        payloadHash,
      ],
      `0x${'e'.repeat(64)}`,
      3,
    );
    const web3Service = {
      getCurrentBlockNumber: jest.fn(async () => 120),
      getLogs: jest.fn(async (_chainId, filter) => {
        if (filter.topics?.[0] === routerInterface.getEventTopic('FundsRouted')) {
          return [fundingLog];
        }

        return [withdrawalLog];
      }),
    };
    const web3FundingService = {
      recordFundsRoutedEvent: jest.fn(async () => ({ applied: true })),
    };
    const web3WithdrawService = {
      recordWithdrawalRequestedEvent: jest.fn(async () => ({ applied: true })),
    };
    const service = new Web3RouterEventPollerService(
      {
        find: jest.fn(async () => [
          {
            requestId,
            chainId: 11155111,
            routerAddress,
            startBlockNumber: 90,
            expiresAt: '2999-01-01T00:00:00.000Z',
          },
        ]),
      } as never,
      {
        find: jest.fn(async () => [
          {
            withdrawalId,
            chainId: 11155111,
            routerAddress,
            startBlockNumber: 91,
            expiresAt: '2999-01-01T00:00:00.000Z',
          },
        ]),
      } as never,
      web3Service as never,
      web3FundingService as never,
      web3WithdrawService as never,
    );

    await expect(service.pollRouterEvents()).resolves.toBe(2);

    expect(web3Service.getLogs).toHaveBeenCalledWith(
      11155111,
      expect.objectContaining({
        address: routerAddress,
        fromBlock: 90,
        toBlock: 120,
        topics: [routerInterface.getEventTopic('FundsRouted'), requestId],
      }),
    );
    expect(web3FundingService.recordFundsRoutedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        txHash: fundingLog.transactionHash,
        logIndex: fundingLog.logIndex,
      }),
    );
    expect(web3WithdrawService.recordWithdrawalRequestedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: withdrawalId,
        txHash: withdrawalLog.transactionHash,
        logIndex: withdrawalLog.logIndex,
      }),
    );
  });

  function buildLog(
    eventName: 'FundsRouted' | 'WithdrawalRequested',
    values: unknown[],
    transactionHash: string,
    logIndex: number,
  ) {
    const encoded = routerInterface.encodeEventLog(
      routerInterface.getEvent(eventName),
      values,
    );

    return {
      address: routerAddress,
      topics: encoded.topics,
      data: encoded.data,
      transactionHash,
      logIndex,
      blockNumber: 110 + logIndex,
    };
  }
});
