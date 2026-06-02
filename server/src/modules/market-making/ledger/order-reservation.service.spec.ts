import { OrderReservationService } from './order-reservation.service';

describe('OrderReservationService', () => {
  const balanceLedgerService = {
    lockFunds: jest.fn(),
    unlockFunds: jest.fn(),
    getExistingBalance: jest.fn(),
  };
  const ledgerEntryRepository = {
    find: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    balanceLedgerService.lockFunds.mockResolvedValue({ applied: true });
    balanceLedgerService.unlockFunds.mockResolvedValue({ applied: true });
    balanceLedgerService.getExistingBalance.mockResolvedValue(null);
    ledgerEntryRepository.find.mockResolvedValue([]);
  });

  it('reserves quote asset for buy limit orders', async () => {
    const service = new OrderReservationService(balanceLedgerService as any);

    const result = await service.reserveForLimitOrder({
      orderId: 'order-1',
      userId: 'user-1',
      intentId: 'intent-1',
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      qty: '1.5',
    });

    expect(balanceLedgerService.lockFunds).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '150',
      idempotencyKey: 'reserve:intent-1',
      refType: 'strategy_order_intent',
      refId: 'intent-1',
    });
    expect(result).toEqual({
      orderId: 'order-1',
      assetId: 'USDT',
      amount: '150',
      applied: true,
    });
  });

  it('reserves base asset for sell limit orders', async () => {
    const service = new OrderReservationService(balanceLedgerService as any);

    await service.reserveForLimitOrder({
      orderId: 'order-1',
      userId: 'user-1',
      intentId: 'intent-1',
      pair: 'BTC/USDT',
      side: 'sell',
      price: '100',
      qty: '1.5',
    });

    expect(balanceLedgerService.lockFunds).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'BTC',
        amount: '1.5',
      }),
    );
  });

  it('releases the same reservation amount for exchange create failure', async () => {
    const service = new OrderReservationService(balanceLedgerService as any);

    await service.releaseLimitOrderReservation({
      orderId: 'order-1',
      userId: 'user-1',
      intentId: 'intent-1',
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      qty: '1.5',
      reason: 'exchange_create_failed',
    });

    expect(balanceLedgerService.unlockFunds).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '150',
      idempotencyKey: 'reserve-release:intent-1:exchange_create_failed',
      refType: 'exchange_create_failed',
      refId: 'intent-1',
    });
  });

  it('releases only the unfilled remainder for cancelled partially filled orders', async () => {
    const service = new OrderReservationService(balanceLedgerService as any);

    await service.releaseLimitOrderReservation({
      orderId: 'order-1',
      userId: 'user-1',
      intentId: 'intent-cancel',
      releaseId: 'exchange-order-1',
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      qty: '1.5',
      filledQty: '0.4',
      reason: 'exchange_order_cancelled',
    });

    expect(balanceLedgerService.unlockFunds).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '110',
      idempotencyKey:
        'reserve-release:exchange-order-1:exchange_order_cancelled',
      refType: 'exchange_order_cancelled',
      refId: 'exchange-order-1',
    });
  });

  it('releases only currently locked funds for terminal tracker cleanup', async () => {
    const service = new OrderReservationService(balanceLedgerService as any);
    balanceLedgerService.getExistingBalance.mockResolvedValue({
      locked: '25',
    });

    const result = await service.releaseRemainingLimitOrderReservation({
      orderId: 'order-1',
      userId: 'user-1',
      intentId: 'intent-cancel',
      releaseId: 'exchange-order-1',
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      qty: '1.5',
      filledQty: '0.4',
      reason: 'exchange_order_cancelled',
    });

    expect(balanceLedgerService.unlockFunds).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '25',
      idempotencyKey:
        'reserve-release:exchange-order-1:exchange_order_cancelled',
      refType: 'exchange_order_cancelled',
      refId: 'exchange-order-1',
    });
    expect(result).toMatchObject({
      orderId: 'order-1',
      assetId: 'USDT',
      amount: '25',
      applied: true,
    });
  });

  it('skips terminal tracker cleanup when no locked funds remain', async () => {
    const service = new OrderReservationService(balanceLedgerService as any);
    balanceLedgerService.getExistingBalance.mockResolvedValue({
      locked: '0',
    });

    const result = await service.releaseRemainingLimitOrderReservation({
      orderId: 'order-1',
      userId: 'user-1',
      intentId: 'intent-cancel',
      releaseId: 'exchange-order-1',
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      qty: '0',
      reason: 'exchange_order_cancelled',
    });

    expect(balanceLedgerService.unlockFunds).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      orderId: 'order-1',
      assetId: 'USDT',
      amount: '0',
      applied: false,
    });
  });

  it('does not release filled terminal orders when cumulative fill is missing', async () => {
    const service = new OrderReservationService(balanceLedgerService as any);
    balanceLedgerService.getExistingBalance.mockResolvedValue({
      locked: '150',
    });

    const result = await service.releaseRemainingLimitOrderReservation({
      orderId: 'order-1',
      userId: 'user-1',
      intentId: 'intent-filled',
      releaseId: 'exchange-order-1',
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      qty: '1.5',
      filledQty: '0',
      reason: 'exchange_order_filled',
    });

    expect(balanceLedgerService.unlockFunds).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      orderId: 'order-1',
      assetId: 'USDT',
      amount: '0',
      applied: false,
    });
  });

  it('uses the order asset locked balance when terminal tracker quantity is unusable', async () => {
    const service = new OrderReservationService(balanceLedgerService as any);
    balanceLedgerService.getExistingBalance.mockResolvedValue({
      locked: '0.02',
    });

    await service.releaseRemainingLimitOrderReservation({
      orderId: 'order-1',
      userId: 'user-1',
      intentId: 'intent-cancel',
      releaseId: 'exchange-order-1',
      pair: 'BTC/USDT',
      side: 'sell',
      price: '100',
      qty: '0',
      reason: 'exchange_order_cancelled',
    });

    expect(balanceLedgerService.unlockFunds).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        assetId: 'BTC',
        amount: '0.02',
      }),
    );
  });

  it('recovers dangling active reservations when no live intent or open order remains', async () => {
    const service = new OrderReservationService(
      balanceLedgerService as any,
      ledgerEntryRepository as any,
    );

    ledgerEntryRepository.find.mockResolvedValue([
      {
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'USDT',
        amount: '100',
        type: 'reserve_lock',
        refId: 'intent-1',
      },
      {
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'USDT',
        amount: '-25',
        type: 'fill_settle',
        refId: 'trade-1',
      },
    ]);

    const recovered = await service.recoverDanglingReservations({
      liveIntentIds: [],
      openOrderIds: [],
    });

    expect(recovered).toEqual([
      {
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'USDT',
        amount: '75',
        liveIntentIds: ['intent-1'],
      },
    ]);
    expect(balanceLedgerService.unlockFunds).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '75',
      idempotencyKey: 'reservation-recovery:order-1:USDT',
      refType: 'reservation_recovery',
      refId: 'order-1',
    });
  });

  it('keeps active reservations with a live intent or open order', async () => {
    const service = new OrderReservationService(
      balanceLedgerService as any,
      ledgerEntryRepository as any,
    );

    ledgerEntryRepository.find.mockResolvedValue([
      {
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'USDT',
        amount: '100',
        type: 'reserve_lock',
        refId: 'intent-1',
      },
      {
        orderId: 'order-2',
        userId: 'user-1',
        assetId: 'USDT',
        amount: '100',
        type: 'reserve_lock',
        refId: 'intent-2',
      },
    ]);

    const recovered = await service.recoverDanglingReservations({
      liveIntentIds: ['intent-1'],
      openOrderIds: ['order-2'],
    });

    expect(recovered).toEqual([]);
    expect(balanceLedgerService.unlockFunds).not.toHaveBeenCalled();
  });

  it('recovers dangling reservations for one stopped order without touching other orders', async () => {
    const service = new OrderReservationService(
      balanceLedgerService as any,
      ledgerEntryRepository as any,
    );

    ledgerEntryRepository.find.mockResolvedValue([
      {
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'USDT',
        amount: '100',
        type: 'reserve_lock',
        refId: 'intent-1',
      },
    ]);

    const recovered = await service.recoverDanglingReservationsForOrder({
      orderId: 'order-1',
      liveIntentIds: [],
      hasOpenOrder: false,
    });

    expect(ledgerEntryRepository.find).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
    });
    expect(recovered).toEqual([
      {
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'USDT',
        amount: '100',
        liveIntentIds: ['intent-1'],
      },
    ]);
    expect(balanceLedgerService.unlockFunds).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '100',
      idempotencyKey: 'reservation-recovery:order-1:USDT',
      refType: 'reservation_recovery',
      refId: 'order-1',
    });
  });

  it('does not recover order-scoped reservations while an open order remains', async () => {
    const service = new OrderReservationService(
      balanceLedgerService as any,
      ledgerEntryRepository as any,
    );

    const recovered = await service.recoverDanglingReservationsForOrder({
      orderId: 'order-1',
      liveIntentIds: [],
      hasOpenOrder: true,
    });

    expect(recovered).toEqual([]);
    expect(ledgerEntryRepository.find).not.toHaveBeenCalled();
    expect(balanceLedgerService.unlockFunds).not.toHaveBeenCalled();
  });
});
