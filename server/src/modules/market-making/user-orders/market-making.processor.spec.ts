/* eslint-disable @typescript-eslint/no-explicit-any */
import { MarketMakingOrderProcessor } from './market-making.processor';
import { MarketMakingRuntimeService } from './market-making-runtime.service';

describe('MarketMakingOrderProcessor', () => {
  const createProcessor = () => {
    const userOrdersService = {
      updateMarketMakingOrderState: jest.fn(),
      findMarketMakingByOrderId: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        strategyDefinitionId: 'strategy-def-1',
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
      startArbitrageStrategyForUser: jest.fn(),
      executeVolumeStrategy: jest.fn(),
      stopStrategyForUser: jest.fn(),
      stopMarketMakingStrategyForOrder: jest.fn(),
      linkDefinitionToStrategyInstance: jest.fn(),
    };
    const strategyConfigResolver = {
      getDefinitionControllerType: jest.fn(
        (definition) => definition.controllerType || definition.executorType,
      ),
      resolveForOrderSnapshot: jest.fn(
        async (_definitionId, overrides = {}) => ({
          controllerType: 'pureMarketMaking',
          resolvedConfig: {
            bidSpread: 0.001,
            askSpread: 0.001,
            orderAmount: 0,
            orderRefreshTime: 10000,
            numberOfLayers: 1,
            priceSourceType: 'MID_PRICE',
            amountChangePerLayer: 0,
            amountChangeType: 'fixed',
            ceilingPrice: 0,
            floorPrice: 0,
            ...overrides,
          },
        }),
      ),
      resolveDefinitionStartConfig: jest.fn((definition, payload) => ({
        strategyType: definition.controllerType || definition.executorType,
        mergedConfig: {
          ...(definition.defaultConfig || {}),
          userId: payload.userId,
          clientId: payload.marketMakingOrderId || payload.clientId,
          ...(payload.marketMakingOrderId
            ? { marketMakingOrderId: payload.marketMakingOrderId }
            : {}),
          ...(payload.config || {}),
        },
      })),
    };
    const strategyRuntimeDispatcher = {
      toStrategyType: jest.fn((controllerType: string) => {
        if (controllerType === 'arbitrage') return 'arbitrage';
        if (controllerType === 'pureMarketMaking') return 'pureMarketMaking';
        if (controllerType === 'volume') return 'volume';
        throw new Error(`Unsupported controller type: ${controllerType}`);
      }),
      startByStrategyType: jest
        .fn()
        .mockImplementation(
          async (strategyType: string, runtimeConfig: any) => {
            if (strategyType === 'pureMarketMaking') {
              await strategyService.executePureMarketMakingStrategy(
                runtimeConfig,
              );

              return;
            }
            if (strategyType === 'arbitrage') {
              await strategyService.startArbitrageStrategyForUser(
                runtimeConfig,
                Number(runtimeConfig.checkIntervalSeconds || 10),
                Number(runtimeConfig.maxOpenOrders || 1),
              );

              return;
            }
            if (strategyType === 'volume') {
              await strategyService.executeVolumeStrategy(
                String(runtimeConfig.exchangeName),
                String(runtimeConfig.symbol),
                Number(runtimeConfig.incrementPercentage || 0),
                Number(runtimeConfig.intervalTime || 10),
                Number(runtimeConfig.tradeAmount || 0),
                Number(runtimeConfig.numTrades || 1),
                String(runtimeConfig.userId),
                String(runtimeConfig.clientId),
                Number(runtimeConfig.pricePushRate || 0),
                runtimeConfig.postOnlySide,
              );
            }
          },
        ),
      stopByStrategyType: jest
        .fn()
        .mockImplementation(
          async (strategyType: string, userId: string, clientId: string) => {
            await strategyService.stopStrategyForUser(
              userId,
              clientId,
              strategyType,
            );
          },
        ),
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
      create: jest.fn((payload) => payload),
      save: jest.fn(),
    };
    const marketMakingOrderIntentRepository = {
      update: jest.fn(),
      findOne: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        userId: 'user-1',
      }),
      save: jest.fn(),
    };
    const strategyDefinitionRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'strategy-def-1',
        enabled: true,
        controllerType: 'pureMarketMaking',
        defaultConfig: {},
      }),
    };
    const marketMakingRuntimeService = new MarketMakingRuntimeService(
      strategyRuntimeDispatcher as any,
      strategyService as any,
      strategyDefinitionRepository as any,
    );

    const processor = new MarketMakingOrderProcessor(
      userOrdersService as any,
      marketMakingRuntimeService as any,
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
      { getCampaigns: jest.fn() } as any,
      {
        findFirstAPIKeyByExchange: jest.fn(),
        getDepositAddress: jest.fn(),
      } as any,
      { getNetworkForAsset: jest.fn() } as any,
      {} as any,
      strategyConfigResolver as any,
      paymentStateRepository as any,
      marketMakingOrderIntentRepository as any,
      marketMakingRepository as any,
      balanceLedgerService as any,
    );

    return {
      processor,
      userOrdersService,
      strategyService,
      strategyConfigResolver,
      strategyRuntimeDispatcher,
      paymentStateRepository,
      transactionService,
      marketMakingOrderIntentRepository,
      marketMakingRepository,
      balanceLedgerService,
      strategyDefinitionRepository,
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

  it('refunds snapshot when initial payer does not match bound intent user', async () => {
    const {
      processor,
      marketMakingOrderIntentRepository,
      transactionService,
      balanceLedgerService,
    } = createProcessor();

    marketMakingOrderIntentRepository.findOne.mockResolvedValueOnce({
      orderId: 'order-1',
      userId: 'user-expected',
    });

    const job = {
      data: {
        snapshotId: 'snapshot-user-mismatch',
        orderId: 'order-1',
        marketMakingPairId: 'pair-1',
        memoDetails: { orderId: 'order-1', marketMakingPairId: 'pair-1' },
        snapshot: {
          snapshot_id: 'snapshot-user-mismatch',
          asset_id: 'asset-base',
          amount: '10',
          opponent_id: 'user-actual',
        },
      },
      queue: {
        getJob: jest.fn().mockResolvedValue(null),
        add: jest.fn().mockResolvedValue(undefined),
      },
    } as any;

    await processor.handleProcessMMSnapshot(job);

    expect(transactionService.refund).toHaveBeenCalledTimes(1);
    expect(balanceLedgerService.creditDeposit).not.toHaveBeenCalled();
    expect(job.queue.add).not.toHaveBeenCalled();
  });

  it('refunds snapshot when subsequent payer does not match payment state user', async () => {
    const { processor, paymentStateRepository, transactionService } =
      createProcessor();

    paymentStateRepository.findOne.mockResolvedValueOnce({
      orderId: 'order-1',
      userId: 'user-expected',
      baseAssetAmount: '0',
      quoteAssetAmount: '0',
      baseFeeAssetAmount: '0',
      quoteFeeAssetAmount: '0',
    });

    const job = {
      data: {
        snapshotId: 'snapshot-existing-user-mismatch',
        orderId: 'order-1',
        marketMakingPairId: 'pair-1',
        memoDetails: { orderId: 'order-1', marketMakingPairId: 'pair-1' },
        snapshot: {
          snapshot_id: 'snapshot-existing-user-mismatch',
          asset_id: 'asset-base',
          amount: '10',
          opponent_id: 'user-actual',
        },
      },
      queue: {
        getJob: jest.fn().mockResolvedValue(null),
        add: jest.fn().mockResolvedValue(undefined),
      },
    } as any;

    await processor.handleProcessMMSnapshot(job);

    expect(transactionService.refund).toHaveBeenCalledTimes(1);
    expect(job.queue.add).not.toHaveBeenCalled();
  });

  it('attempts ledger debit before snapshot refund transfer', async () => {
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

  it('still executes snapshot refund transfer when internal debit is insufficient', async () => {
    const { processor, balanceLedgerService, transactionService } =
      createProcessor();

    balanceLedgerService.debitWithdrawal.mockRejectedValueOnce(
      new Error('insufficient available balance'),
    );

    await (processor as any).refundUser(
      {
        snapshot_id: 'snapshot-no-ledger',
        asset_id: 'asset-base',
        amount: '2.5',
        opponent_id: 'user-1',
      },
      'invalid snapshot',
    );

    expect(transactionService.refund).toHaveBeenCalledTimes(1);
    expect(balanceLedgerService.creditDeposit).not.toHaveBeenCalled();
  });

  it('skips duplicate snapshot refund transfer when debit idempotency already exists', async () => {
    const { processor, balanceLedgerService, transactionService } =
      createProcessor();

    balanceLedgerService.debitWithdrawal.mockResolvedValueOnce({
      applied: false,
    });

    await (processor as any).refundUser(
      {
        snapshot_id: 'snapshot-dup',
        asset_id: 'asset-base',
        amount: '1',
        opponent_id: 'user-1',
      },
      'duplicate retry',
    );

    expect(transactionService.refund).not.toHaveBeenCalled();
  });

  it('does not compensate when refund transfer fails after insufficient debit', async () => {
    const { processor, balanceLedgerService, transactionService } =
      createProcessor();

    balanceLedgerService.debitWithdrawal.mockRejectedValueOnce(
      new Error('insufficient available balance'),
    );
    transactionService.refund.mockRejectedValueOnce(new Error('transfer fail'));

    await expect(
      (processor as any).refundUser(
        {
          snapshot_id: 'snapshot-insufficient-fail',
          asset_id: 'asset-base',
          amount: '3',
          opponent_id: 'user-1',
        },
        'invalid snapshot',
      ),
    ).rejects.toThrow('transfer fail');

    expect(balanceLedgerService.creditDeposit).not.toHaveBeenCalled();
  });

  it('credits compensation when snapshot refund transfer fails after debit', async () => {
    const { processor, balanceLedgerService, transactionService } =
      createProcessor();

    transactionService.refund.mockRejectedValueOnce(
      new Error('transfer failed'),
    );

    await expect(
      (processor as any).refundUser(
        {
          snapshot_id: 'snapshot-3',
          asset_id: 'asset-base',
          amount: '8.5',
          opponent_id: 'user-1',
        },
        'test-reason',
      ),
    ).rejects.toThrow('transfer failed');

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

  it('starts MM from snapshot without execute_mm_cycle queue loop', async () => {
    const { processor, strategyRuntimeDispatcher, userOrdersService } =
      createProcessor();
    const queue = {
      add: jest.fn(),
    };

    userOrdersService.findMarketMakingByOrderId.mockResolvedValueOnce({
      orderId: 'order-1',
      userId: 'user-1',
      strategyDefinitionId: 'strategy-def-1',
      strategySnapshot: {
        controllerType: 'pureMarketMaking',
        resolvedConfig: {
          userId: 'user-1',
          clientId: 'order-1',
          marketMakingOrderId: 'order-1',
          pair: 'BTC-USDT',
          exchangeName: 'binance',
          bidSpread: 0.1,
          askSpread: 0.2,
          orderAmount: 10,
          orderRefreshTime: 15000,
          numberOfLayers: 2,
        },
      },
    });

    await processor.handleStartMM({
      data: { userId: 'user-1', orderId: 'order-1' },
      queue,
    } as any);

    expect(userOrdersService.updateMarketMakingOrderState).toHaveBeenCalledWith(
      'order-1',
      'running',
    );
    expect(strategyRuntimeDispatcher.startByStrategyType).toHaveBeenCalledWith(
      'pureMarketMaking',
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

  it('starts MM from strategy snapshot before legacy definition lookup', async () => {
    const {
      processor,
      strategyRuntimeDispatcher,
      strategyConfigResolver,
      strategyDefinitionRepository,
      userOrdersService,
    } = createProcessor();

    userOrdersService.findMarketMakingByOrderId.mockResolvedValueOnce({
      orderId: 'order-1',
      userId: 'user-1',
      strategyDefinitionId: 'strategy-def-1',
      strategySnapshot: {
        controllerType: 'pureMarketMaking',
        resolvedConfig: {
          userId: 'user-1',
          clientId: 'order-1',
          marketMakingOrderId: 'order-1',
          pair: 'BTC-USDT',
          exchangeName: 'binance',
          bidSpread: 0.25,
          askSpread: 0.3,
          orderAmount: 12,
          orderRefreshTime: 12000,
          numberOfLayers: 2,
        },
      },
    });

    await processor.handleStartMM({
      data: { userId: 'user-1', orderId: 'order-1' },
      queue: { add: jest.fn() },
    } as any);

    expect(strategyRuntimeDispatcher.startByStrategyType).toHaveBeenCalledWith(
      'pureMarketMaking',
      expect.objectContaining({
        pair: 'BTC-USDT',
        bidSpread: 0.25,
        askSpread: 0.3,
      }),
    );
    expect(
      strategyConfigResolver.resolveDefinitionStartConfig,
    ).not.toHaveBeenCalled();
    expect(strategyDefinitionRepository.findOne).not.toHaveBeenCalled();
  });

  it('fails start_mm when strategy snapshot is missing after cutover', async () => {
    const {
      processor,
      userOrdersService,
      strategyConfigResolver,
      strategyDefinitionRepository,
      userOrdersService: { updateMarketMakingOrderState },
    } = createProcessor();

    userOrdersService.findMarketMakingByOrderId.mockResolvedValueOnce({
      orderId: 'order-1',
      userId: 'user-1',
      strategyDefinitionId: 'strategy-def-1',
      strategySnapshot: null,
    });

    await expect(
      processor.handleStartMM({
        data: { userId: 'user-1', orderId: 'order-1' },
        queue: { add: jest.fn() },
      } as any),
    ).rejects.toThrow('Order order-1 has no strategySnapshot.');

    expect(updateMarketMakingOrderState).toHaveBeenCalledWith(
      'order-1',
      'failed',
    );
    expect(
      strategyConfigResolver.resolveDefinitionStartConfig,
    ).not.toHaveBeenCalled();
    expect(strategyDefinitionRepository.findOne).not.toHaveBeenCalled();
  });

  it('stores strategy snapshot when payment becomes complete', async () => {
    const {
      processor,
      paymentStateRepository,
      marketMakingOrderIntentRepository,
      marketMakingRepository,
      strategyConfigResolver,
      userOrdersService,
    } = createProcessor();

    paymentStateRepository.findOne.mockResolvedValueOnce({
      orderId: 'order-1',
      userId: 'user-1',
      baseAssetId: 'asset-base',
      baseAssetAmount: '10',
      quoteAssetId: 'asset-quote',
      quoteAssetAmount: '20',
      baseFeeAssetId: 'asset-fee-base',
      baseFeeAssetAmount: '1',
      quoteFeeAssetId: 'asset-fee-quote',
      quoteFeeAssetAmount: '2',
      requiredBaseWithdrawalFee: '0',
      requiredQuoteWithdrawalFee: '0',
      requiredStrategyFeePercentage: '0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    marketMakingOrderIntentRepository.findOne.mockResolvedValueOnce({
      orderId: 'order-1',
      strategyDefinitionId: 'strategy-def-1',
      configOverrides: {
        bidSpread: 0.002,
        orderRefreshTime: 15000,
      },
    });
    marketMakingRepository.findOne.mockResolvedValueOnce(null);
    marketMakingRepository.save.mockImplementation(async (payload) => payload);

    await processor.handleCheckPaymentComplete({
      data: { orderId: 'order-1', marketMakingPairId: 'pair-1' },
      attemptsMade: 0,
      opts: { attempts: 3 },
      queue: { add: jest.fn() },
    } as any);

    expect(strategyConfigResolver.resolveForOrderSnapshot).toHaveBeenCalledWith(
      'strategy-def-1',
      expect.objectContaining({
        userId: 'user-1',
        clientId: 'order-1',
        marketMakingOrderId: 'order-1',
        exchangeName: 'binance',
        bidSpread: 0.002,
        orderRefreshTime: 15000,
      }),
    );
    expect(marketMakingRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        strategyDefinitionId: 'strategy-def-1',
        strategySnapshot: expect.objectContaining({
          controllerType: 'pureMarketMaking',
        }),
      }),
    );
    expect(userOrdersService.updateMarketMakingOrderState).toHaveBeenCalledWith(
      'order-1',
      'payment_complete',
    );
  });
  it('does nothing when start_mm order is missing', async () => {
    const { processor, strategyRuntimeDispatcher, userOrdersService } =
      createProcessor();

    userOrdersService.findMarketMakingByOrderId.mockResolvedValueOnce(null);
    const queue = {
      add: jest.fn(),
    };

    await processor.handleStartMM({
      data: { userId: 'user-1', orderId: 'missing' },
      queue,
    } as any);

    expect(
      strategyRuntimeDispatcher.startByStrategyType,
    ).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('stops MM via runtime dispatcher and updates order state', async () => {
    const {
      processor,
      strategyRuntimeDispatcher,
      strategyService,
      userOrdersService,
    } = createProcessor();

    await processor.handleStopMM({
      data: { userId: 'user-1', orderId: 'order-1' },
    } as any);

    expect(strategyRuntimeDispatcher.stopByStrategyType).toHaveBeenCalledWith(
      'pureMarketMaking',
      'user-1',
      'order-1',
    );
    expect(strategyService.stopStrategyForUser).toHaveBeenCalledWith(
      'user-1',
      'order-1',
      'pureMarketMaking',
    );
    expect(userOrdersService.updateMarketMakingOrderState).toHaveBeenCalledWith(
      'order-1',
      'stopped',
    );
  });
});
