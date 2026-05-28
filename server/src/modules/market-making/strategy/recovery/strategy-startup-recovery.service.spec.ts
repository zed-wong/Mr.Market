import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { StrategyStartupRecoveryService } from './strategy-startup-recovery.service';

describe('StrategyStartupRecoveryService', () => {
  const createStrategy = (
    overrides?: Partial<StrategyInstance>,
  ): StrategyInstance =>
    ({
      strategyKey: 'order-1-pureMarketMaking',
      userId: 'user-1',
      clientId: 'order-1',
      strategyType: 'pureMarketMaking',
      marketMakingOrderId: 'order-1',
      status: 'running',
      parameters: {},
      ...overrides,
    }) as StrategyInstance;

  const createIntent = (overrides?: Record<string, unknown>) => ({
    intentId: 'intent-1',
    strategyKey: 'order-1-pureMarketMaking',
    userId: 'user-1',
    clientId: 'order-1',
    type: 'CREATE_LIMIT_ORDER',
    exchange: 'mexc',
    pair: 'XIN/USDT',
    side: 'buy',
    price: '56.22',
    qty: '0.04',
    status: 'SENT',
    createdAt: '2026-05-28T05:23:25.060Z',
    updatedAt: '2026-05-28T05:23:25.060Z',
    ...overrides,
  });

  const createService = ({
    intents = [createIntent()],
    mappingByClientOrderId = null,
    mappingByExchangeOrderId = null,
  }: {
    intents?: any[];
    mappingByClientOrderId?: any;
    mappingByExchangeOrderId?: any;
  } = {}) => {
    const strategyIntentStoreService = {
      listInterruptedCreateIntents: jest.fn().mockResolvedValue(intents),
      updateIntentStatus: jest.fn().mockResolvedValue(undefined),
    };
    const balanceLedgerService = {
      unlockFunds: jest.fn().mockResolvedValue({ applied: true }),
    };
    const exchangeOrderMappingService = {
      findByClientOrderId: jest.fn().mockResolvedValue(mappingByClientOrderId),
      findByExchangeOrderId: jest
        .fn()
        .mockResolvedValue(mappingByExchangeOrderId),
    };
    const service = new StrategyStartupRecoveryService(
      strategyIntentStoreService as any,
      balanceLedgerService as any,
      exchangeOrderMappingService as any,
    );

    return {
      service,
      strategyIntentStoreService,
      balanceLedgerService,
      exchangeOrderMappingService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('releases interrupted create reservations when no owned exchange order remains', async () => {
    const { service, balanceLedgerService, strategyIntentStoreService } =
      createService();

    await service.recoverInterruptedCreateIntentReservations(
      createStrategy(),
      [],
    );

    expect(balanceLedgerService.unlockFunds).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '2.2488',
      idempotencyKey: 'reserve-release:intent-1:interrupted_intent_recovery',
      refType: 'interrupted_intent_recovery',
      refId: 'intent-1',
    });
    expect(strategyIntentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'intent-1',
      'CANCELLED',
      'interrupted create intent recovered on startup',
    );
  });

  it('does not release when an open exchange order is owned by the strategy', async () => {
    const { service, balanceLedgerService, strategyIntentStoreService } =
      createService({
        mappingByExchangeOrderId: {
          orderId: 'order-1',
          exchangeOrderId: 'exchange-order-1',
        },
      });

    await service.recoverInterruptedCreateIntentReservations(createStrategy(), [
      { id: 'exchange-order-1' },
    ]);

    expect(balanceLedgerService.unlockFunds).not.toHaveBeenCalled();
    expect(strategyIntentStoreService.updateIntentStatus).not.toHaveBeenCalled();
  });

  it('skips intents that already have an exchange order id attached', async () => {
    const { service, balanceLedgerService, strategyIntentStoreService } =
      createService({
        intents: [createIntent({ mixinOrderId: 'exchange-order-1' })],
      });

    await service.recoverInterruptedCreateIntentReservations(
      createStrategy(),
      [],
    );

    expect(balanceLedgerService.unlockFunds).not.toHaveBeenCalled();
    expect(strategyIntentStoreService.updateIntentStatus).not.toHaveBeenCalled();
  });
});
