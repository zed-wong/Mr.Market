import { MarketMakingOrderProcessor } from './market-making.processor';

describe('MarketMakingOrderProcessor', () => {
  const createProcessor = () => {
    const userOrdersService = {
      updateMarketMakingOrderState: jest.fn(),
      findMarketMakingByOrderId: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        userId: 'user-1',
        pair: 'BTC-USDT-ERC20',
        exchangeName: 'binance',
        bidSpread: '0.1',
        askSpread: '0.2',
        orderAmount: '10',
        orderRefreshTime: '15000',
        numberOfLayers: '2',
        priceSourceType: 'MID_PRICE',
        amountChangePerLayer: '0',
        amountChangeType: 'fixed',
        ceilingPrice: '0',
        floorPrice: '0',
      }),
    };
    const strategyService = {
      executeMMCycle: jest.fn(),
      executePureMarketMakingStrategy: jest.fn(),
      stopStrategyForUser: jest.fn(),
    };
    const paymentStateRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => payload),
    };
    const transactionService = {
      refund: jest.fn().mockResolvedValue([{}]),
      transfer: jest.fn().mockResolvedValue([{}]),
    };
    const balanceLedgerService = {
      creditDeposit: jest.fn().mockResolvedValue({ applied: true }),
      debitWithdrawal: jest.fn().mockResolvedValue({ applied: true }),
    };
    const marketMakingRepository = {
      findOne: jest.fn().mockResolvedValue({ userId: 'user-1' }),
      create: jest.fn(),
      save: jest.fn(),
    };

    const processor = new MarketMakingOrderProcessor(
      userOrdersService as any,
      strategyService as any,
      {
        calculateMoveFundsFee: jest.fn().mockResolvedValue({
          base_fee_id: 'asset-fee-base',
          quote_fee_id: 'asset-fee-quote',
          base_fee_amount: '1',
          quote_fee_amount: '2',
          market_making_fee_percentage: '0.1',
        }),
      } as any,
      {
        findMarketMakingPairById: jest.fn().mockResolvedValue({
          enable: true,
          exchange_id: 'binance',
          symbol: 'BTC/USDT',
          base_asset_id: 'asset-base',
          quote_asset_id: 'asset-quote',
        }),
      } as any,
      transactionService as any,
      { executeWithdrawal: jest.fn() } as any,
      { joinCampaign: jest.fn() } as any,
      { getCampaigns: jest.fn() } as any,
      {
        findFirstAPIKeyByExchange: jest.fn(),
        getDepositAddress: jest.fn(),
      } as any,
      { getNetworkForAsset: jest.fn() } as any,
      {} as any,
      paymentStateRepository as any,
      { update: jest.fn(), findOne: jest.fn(), save: jest.fn() } as any,
      marketMakingRepository as any,
      balanceLedgerService as any,
    );

    return {
      processor,
      userOrdersService,
      strategyService,
      paymentStateRepository,
      transactionService,
      marketMakingRepository,
      balanceLedgerService,
    };
  };

  it('credits ledger on accepted market-making snapshot intake', async () => {
    const { processor } = createProcessor();

    const job = {
      data: {
        snapshotId: 'snapshot-1',
        orderId: 'order-1',
        marketMakingPairId: 'pair-1',
        memoDetails: { orderId: 'order-1', marketMakingPairId: 'pair-1' },
        snapshot: {
          snapshot_id: 'snapshot-1',
          asset_id: 'asset-base',
          amount: '10',
          opponent_id: 'user-1',
        },
      },
      queue: {
        getJob: jest.fn().mockResolvedValue(null),
        add: jest.fn().mockResolvedValue(undefined),
      },
    } as any;

    await processor.handleProcessMMSnapshot(job);

    expect(
      (processor as any).balanceLedgerService.creditDeposit,
    ).toHaveBeenCalledWith({
      userId: 'user-1',
      assetId: 'asset-base',
      amount: '10',
      idempotencyKey: 'snapshot-credit:snapshot-1',
      refType: 'market_making_snapshot',
      refId: 'snapshot-1',
    });
  });

  it('debits ledger before snapshot refund transfer', async () => {
    const { processor, balanceLedgerService, transactionService } =
      createProcessor();

    await (processor as any).refundUser(
      {
        snapshot_id: 'snapshot-2',
        asset_id: 'asset-base',
        amount: '12',
        opponent_id: 'user-1',
      },
      'test-reason',
    );

    expect(balanceLedgerService.debitWithdrawal).toHaveBeenCalledWith({
      userId: 'user-1',
      assetId: 'asset-base',
      amount: '12',
      idempotencyKey: 'snapshot-refund:snapshot-2',
      refType: 'market_making_snapshot_refund',
      refId: 'snapshot-2',
    });

    const debitOrder =
      balanceLedgerService.debitWithdrawal.mock.invocationCallOrder[0];
    const refundOrder = transactionService.refund.mock.invocationCallOrder[0];

    expect(debitOrder).toBeLessThan(refundOrder);
  });

  it('credits compensation when snapshot refund transfer fails after debit', async () => {
    const { processor, balanceLedgerService, transactionService } =
      createProcessor();

    transactionService.refund.mockRejectedValueOnce(
      new Error('transfer failed'),
    );

    await (processor as any).refundUser(
      {
        snapshot_id: 'snapshot-3',
        asset_id: 'asset-base',
        amount: '8.5',
        opponent_id: 'user-1',
      },
      'test-reason',
    );

    expect(balanceLedgerService.creditDeposit).toHaveBeenCalledWith({
      userId: 'user-1',
      assetId: 'asset-base',
      amount: '8.5',
      idempotencyKey: 'snapshot-refund:snapshot-3:compensation',
      refType: 'market_making_snapshot_refund_compensation',
      refId: 'snapshot-3',
    });
  });

  it('debits ledger before pending-order refund transfer', async () => {
    const { processor, balanceLedgerService, transactionService } =
      createProcessor();

    await (processor as any).refundMarketMakingPendingOrder(
      'order-9',
      {
        userId: 'user-1',
        baseAssetId: 'asset-base',
        baseAssetAmount: '5',
      },
      'timeout',
    );

    expect(balanceLedgerService.debitWithdrawal).toHaveBeenCalledWith({
      userId: 'user-1',
      assetId: 'asset-base',
      amount: '5',
      idempotencyKey: 'mm-refund:order-9:asset-base',
      refType: 'market_making_order_refund',
      refId: 'order-9',
    });

    const debitOrder =
      balanceLedgerService.debitWithdrawal.mock.invocationCallOrder[0];
    const transferOrder =
      transactionService.transfer.mock.invocationCallOrder[0];

    expect(debitOrder).toBeLessThan(transferOrder);
  });

  it('starts MM by registering strategy session without execute_mm_cycle queue loop', async () => {
    const { processor, strategyService, userOrdersService } = createProcessor();
    const queue = {
      add: jest.fn(),
    };

    await processor.handleStartMM({
      data: { userId: 'user-1', orderId: 'order-1' },
      queue,
    } as any);

    expect(userOrdersService.updateMarketMakingOrderState).toHaveBeenCalledWith(
      'order-1',
      'running',
    );
    expect(
      strategyService.executePureMarketMakingStrategy,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        clientId: 'order-1',
        pair: 'BTC-USDT',
        exchangeName: 'binance',
        bidSpread: 0.1,
        askSpread: 0.2,
        orderAmount: 10,
        orderRefreshTime: 15000,
        numberOfLayers: 2,
      }),
    );
    expect(queue.add).not.toHaveBeenCalledWith(
      'execute_mm_cycle',
      expect.anything(),
      expect.anything(),
    );
  });

  it('does nothing when start_mm order is missing', async () => {
    const { processor, strategyService, userOrdersService } = createProcessor();

    userOrdersService.findMarketMakingByOrderId.mockResolvedValueOnce(null);
    const queue = {
      add: jest.fn(),
    };

    await processor.handleStartMM({
      data: { userId: 'user-1', orderId: 'missing' },
      queue,
    } as any);

    expect(
      strategyService.executePureMarketMakingStrategy,
    ).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
