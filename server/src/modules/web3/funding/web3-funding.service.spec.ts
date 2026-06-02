import { BadRequestException } from '@nestjs/common';
import { ethers } from 'ethers';

import { MR_MARKET_ROUTER_ABI } from '../contracts/mr-market-router.abi';
import { Web3DepositService } from '../deposit/web3-deposit.service';
import { Web3FundingService } from './web3-funding.service';

describe('Web3FundingService', () => {
  const userId = 'user-1';
  const evmAddress = '0x1111111111111111111111111111111111111111';
  const receiverAddress = '0x2222222222222222222222222222222222222222';
  const routerAddress = '0x3333333333333333333333333333333333333333';
  const sepoliaUsdc = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const routerInterface = new ethers.utils.Interface([...MR_MARKET_ROUTER_ABI]);

  const buildService = () => {
    const fundingRows = new Map<string, Record<string, unknown>>();
    const eventRows: Record<string, unknown>[] = [];
    const fundingRequestRepository = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => {
        fundingRows.set(String(row.requestId), row);

        return row;
      }),
      findOne: jest.fn(
        async ({ where }) => fundingRows.get(String(where.requestId)) || null,
      ),
    };
    const eventLogRepository = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => {
        eventRows.push(row);

        return row;
      }),
      findOne: jest.fn(
        async ({ where }) =>
          eventRows.find(
            (row) =>
              row.chainId === where.chainId &&
              row.txHash === where.txHash &&
              row.logIndex === where.logIndex,
          ) || null,
      ),
    };
    const web3Service = {
      getOperatorAddress: jest.fn(() => receiverAddress),
      getCurrentBlockNumber: jest.fn(async () => 90),
      getTransactionReceipt: jest.fn(),
    };
    const web3MarketMakingService = {
      createOrder: jest.fn(async () => ({ orderId: 'order-1' })),
    };
    const web3DepositService = new Web3DepositService(web3Service as never);
    const service = new Web3FundingService(
      fundingRequestRepository as never,
      eventLogRepository as never,
      web3DepositService,
      web3Service as never,
      web3MarketMakingService as never,
    );

    return {
      service,
      web3Service,
      fundingRows,
      fundingRequestRepository,
      eventLogRepository,
      web3MarketMakingService,
    };
  };

  const createRequest = async (service: Web3FundingService) =>
    await service.createFundingRequest(userId, evmAddress, {
      chainId: 11155111,
      routerAddress,
      tokenAddress: sepoliaUsdc,
      amount: '12.34',
      orderDraft: {
        marketMakingPairId: 'pair-1',
        strategyDefinitionId: 'strategy-1',
      },
    });

  it('creates a funding request without creating an order before Router funding', async () => {
    const { service, web3MarketMakingService } = buildService();

    const result = await createRequest(service);

    expect(result.namespace).toBe('/web3/funding-requests');
    expect(result.fundingRequest).toMatchObject({
      userId,
      evmAddress,
      chainId: 11155111,
      routerAddress,
      receiverAddress,
      tokenAddress: sepoliaUsdc,
      amount: '12.34',
      status: 'created',
      startBlockNumber: 90,
      orderId: null,
    });
    expect(result.routerCall).toMatchObject({
      functionName: 'routeFunds',
      routerAddress,
      tokenAddress: sepoliaUsdc,
      amount: '12.34',
      amountBaseUnits: ethers.utils.parseUnits('12.34', 6).toString(),
    });
    expect(result.fundingRequest.requestId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.fundingRequest.payloadHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(web3MarketMakingService.createOrder).not.toHaveBeenCalled();
  });

  it('creates the order only after a matching FundsRouted event is recorded', async () => {
    const { service, web3MarketMakingService } = buildService();
    const request = await createRequest(service);

    const result = await service.recordFundsRoutedEvent({
      chainId: 11155111,
      requestId: request.fundingRequest.requestId,
      user: evmAddress,
      token: sepoliaUsdc,
      amount: ethers.utils.parseUnits('12.34', 6).toString(),
      payloadHash: request.fundingRequest.payloadHash,
      receiver: receiverAddress,
      routerAddress,
      txHash: `0x${'a'.repeat(64)}`,
      logIndex: 0,
      blockNumber: 100,
    });

    expect(web3MarketMakingService.createOrder).toHaveBeenCalledWith(userId, {
      marketMakingPairId: 'pair-1',
      strategyDefinitionId: 'strategy-1',
      initialDeposit: {
        assetId: 'evm:11155111:0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
        amount: '12.34',
      },
      requestId: request.fundingRequest.requestId,
    });
    expect(result).toMatchObject({
      applied: true,
      fundingRequest: {
        status: 'order_created',
        orderId: 'order-1',
        txHash: `0x${'a'.repeat(64)}`,
        logIndex: 0,
      },
    });
  });

  it('rejects mismatched Router event evidence before creating an order', async () => {
    const { service, web3MarketMakingService } = buildService();
    const request = await createRequest(service);

    await expect(
      service.recordFundsRoutedEvent({
        chainId: 11155111,
        requestId: request.fundingRequest.requestId,
        user: evmAddress,
        token: sepoliaUsdc,
        amount: ethers.utils.parseUnits('1', 6).toString(),
        payloadHash: request.fundingRequest.payloadHash,
        receiver: receiverAddress,
        routerAddress,
        txHash: `0x${'b'.repeat(64)}`,
        logIndex: 0,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(web3MarketMakingService.createOrder).not.toHaveBeenCalled();
  });

  it('can verify a funding tx receipt and process its FundsRouted log', async () => {
    const { service, web3Service, web3MarketMakingService } = buildService();
    const request = await createRequest(service);
    const event = routerInterface.encodeEventLog(
      routerInterface.getEvent('FundsRouted'),
      [
        request.fundingRequest.requestId,
        evmAddress,
        sepoliaUsdc,
        ethers.utils.parseUnits('12.34', 6),
        request.fundingRequest.payloadHash,
        receiverAddress,
      ],
    );

    web3Service.getTransactionReceipt.mockResolvedValue({
      status: 1,
      transactionHash: `0x${'c'.repeat(64)}`,
      blockNumber: 101,
      logs: [
        {
          address: routerAddress,
          topics: event.topics,
          data: event.data,
          logIndex: 2,
        },
      ],
    });

    const result = await service.verifyFundingTransaction(
      userId,
      request.fundingRequest.requestId,
      { txHash: `0x${'c'.repeat(64)}` },
    );

    expect(web3Service.getTransactionReceipt).toHaveBeenCalledWith(
      11155111,
      `0x${'c'.repeat(64)}`,
    );
    expect(web3MarketMakingService.createOrder).toHaveBeenCalledTimes(1);
    expect(result.fundingRequest).toMatchObject({
      status: 'order_created',
      orderId: 'order-1',
      txHash: `0x${'c'.repeat(64)}`,
      logIndex: 2,
    });
  });
});
