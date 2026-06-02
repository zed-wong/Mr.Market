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
      attachMixinOrderId: jest.fn().mockResolvedValue(undefined),
    };
    const orderReservationService = {
      releaseLimitOrderReservation: jest.fn().mockResolvedValue({
        applied: true,
      }),
    };
    const exchangeOrderMappingService = {
      findByClientOrderId: jest.fn().mockResolvedValue(mappingByClientOrderId),
      findByExchangeOrderId: jest
        .fn()
        .mockResolvedValue(mappingByExchangeOrderId),
      createMapping: jest.fn().mockResolvedValue(undefined),
    };
    const exchangeOrderTrackerService = {
      upsertOrder: jest.fn(),
    };
    const service = new StrategyStartupRecoveryService(
      strategyIntentStoreService as any,
      orderReservationService as any,
      exchangeOrderMappingService as any,
      exchangeOrderTrackerService as any,
    );

    return {
      service,
      strategyIntentStoreService,
      orderReservationService,
      exchangeOrderMappingService,
      exchangeOrderTrackerService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('releases interrupted create reservations when no owned exchange order remains', async () => {
    const { service, orderReservationService, strategyIntentStoreService } =
      createService();

    await service.recoverInterruptedCreateIntentReservations(
      createStrategy(),
      [],
    );

    expect(orderReservationService.releaseLimitOrderReservation).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      intentId: 'intent-1',
      pair: 'XIN/USDT',
      side: 'buy',
      price: '56.22',
      qty: '0.04',
      reason: 'interrupted_intent_recovery',
    });
    expect(strategyIntentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'intent-1',
      'CANCELLED',
      'interrupted create intent recovered on startup',
    );
  });

  it('restores an interrupted create intent when an owned open exchange order remains', async () => {
    const {
      service,
      orderReservationService,
      strategyIntentStoreService,
      exchangeOrderMappingService,
      exchangeOrderTrackerService,
    } = createService({
        mappingByExchangeOrderId: {
          orderId: 'order-1',
          exchangeOrderId: 'exchange-order-1',
        },
      });

    await service.recoverInterruptedCreateIntentReservations(createStrategy(), [
      {
        id: 'exchange-order-1',
        clientOrderId: 'client-1',
        side: 'buy',
        price: '56.22',
        amount: '0.04',
        status: 'open',
      },
    ]);

    expect(
      orderReservationService.releaseLimitOrderReservation,
    ).not.toHaveBeenCalled();
    expect(exchangeOrderMappingService.createMapping).toHaveBeenCalledWith({
      orderId: 'order-1',
      exchangeOrderId: 'exchange-order-1',
      clientOrderId: 'client-1',
    });
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        strategyKey: 'order-1-pureMarketMaking',
        exchangeOrderId: 'exchange-order-1',
        clientOrderId: 'client-1',
        side: 'buy',
        price: '56.22',
        qty: '0.04',
        status: 'open',
      }),
    );
    expect(strategyIntentStoreService.attachMixinOrderId).toHaveBeenCalledWith(
      'intent-1',
      'exchange-order-1',
    );
    expect(strategyIntentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'intent-1',
      'DONE',
      'interrupted create intent restored on startup',
    );
  });

  it('recovers interrupted creates independently instead of returning after the first open order', async () => {
    const { service, orderReservationService, exchangeOrderTrackerService } =
      createService({
        intents: [
          createIntent({
            intentId: 'intent-open',
            price: '56.22',
            qty: '0.04',
          }),
          createIntent({
            intentId: 'intent-dangling',
            price: '57',
            qty: '0.05',
          }),
        ],
        mappingByExchangeOrderId: {
          orderId: 'order-1',
          exchangeOrderId: 'exchange-order-1',
        },
      });

    await service.recoverInterruptedCreateIntentReservations(createStrategy(), [
      {
        id: 'exchange-order-1',
        side: 'buy',
        price: '56.22',
        amount: '0.04',
        status: 'open',
      },
    ]);

    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledTimes(1);
    expect(orderReservationService.releaseLimitOrderReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: 'intent-dangling',
        reason: 'interrupted_intent_recovery',
      }),
    );
  });

  it('releases an interrupted create with an attached exchange id when no open order remains', async () => {
    const { service, orderReservationService, strategyIntentStoreService } =
      createService({
        intents: [createIntent({ mixinOrderId: 'exchange-order-1' })],
      });

    await service.recoverInterruptedCreateIntentReservations(
      createStrategy(),
      [],
    );

    expect(orderReservationService.releaseLimitOrderReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: 'intent-1',
        reason: 'interrupted_intent_recovery',
      }),
    );
    expect(strategyIntentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'intent-1',
      'CANCELLED',
      'interrupted create intent recovered on startup',
    );
  });
});
