import { OrderReservationService } from './order-reservation.service';

describe('OrderReservationService', () => {
  const balanceLedgerService = {
    lockFunds: jest.fn(),
    unlockFunds: jest.fn(),
    getExistingBalance: jest.fn(),
  };
  const ledgerEntryRepository = {
    find: jest.fn(),
    findOneBy: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    balanceLedgerService.lockFunds.mockResolvedValue({ applied: true });
    balanceLedgerService.unlockFunds.mockResolvedValue({ applied: true });
    balanceLedgerService.getExistingBalance.mockResolvedValue(null);
    ledgerEntryRepository.find.mockResolvedValue([]);
    ledgerEntryRepository.findOneBy.mockResolvedValue(null);
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

  it('reserves AMM swap tokenIn by resolved asset id', async () => {
    const service = new OrderReservationService(balanceLedgerService as any);

    const result = await service.reserveForAmmSwapTokenIn({
      orderId: 'ledger-order-1',
      userOrderId: 'user-order-1',
      accountLabel: 'default',
      userId: 'user-1',
      intentId: 'intent-amm',
      assetId: 'asset-usdc',
      amount: '25.5',
      tradingAccountId: 'account-1',
      chainId: 1,
    });

    expect(balanceLedgerService.lockFunds).toHaveBeenCalledWith({
      orderId: 'ledger-order-1',
      userOrderId: 'user-order-1',
      accountLabel: 'default',
      userId: 'user-1',
      assetId: 'asset-usdc',
      tradingAccountId: 'account-1',
      chainId: 1,
      amount: '25.5',
      idempotencyKey: 'amm-swap-reserve:intent-amm:asset-usdc',
      refType: 'strategy_order_intent',
      refId: 'intent-amm',
    });
    expect(result).toEqual({
      orderId: 'ledger-order-1',
      assetId: 'asset-usdc',
      amount: '25.5',
      applied: true,
    });
  });

  it('reserves gas against the funding operator sponsor scope', async () => {
    const service = new OrderReservationService(balanceLedgerService as any);

    const result = await service.reserveForGasSponsor({
      orderId: 'gas-sponsor-order',
      userOrderId: 'user-order-1',
      accountLabel: 'funding_operator',
      userId: 'user-1',
      intentId: 'intent-amm',
      gasAssetId: 'asset-eth',
      estimatedGasCost: '0.02',
      tradingAccountId: 'gas-account',
      chainId: 1,
    });

    expect(balanceLedgerService.lockFunds).toHaveBeenCalledWith({
      orderId: 'gas-sponsor-order',
      userOrderId: 'user-order-1',
      accountLabel: 'funding_operator',
      userId: 'user-1',
      assetId: 'asset-eth',
      tradingAccountId: 'gas-account',
      chainId: 1,
      amount: '0.02',
      idempotencyKey: 'gas-reserve:intent-amm:asset-eth',
      refType: 'strategy_order_intent',
      refId: 'intent-amm',
    });
    expect(result).toEqual({
      orderId: 'gas-sponsor-order',
      assetId: 'asset-eth',
      amount: '0.02',
      applied: true,
    });
  });

  it('releases remaining direct AMM and gas reservations from locked balances', async () => {
    balanceLedgerService.getExistingBalance.mockResolvedValue({
      locked: '0.5',
    });
    const service = new OrderReservationService(balanceLedgerService as any);

    await service.releaseRemainingAmmSwapTokenInReservation({
      orderId: 'ledger-order-1',
      userOrderId: 'user-order-1',
      accountLabel: 'default',
      userId: 'user-1',
      intentId: 'intent-amm',
      assetId: 'asset-usdc',
      amount: '25',
      reason: 'amm_swap_settled',
    });
    await service.releaseRemainingGasSponsorReservation({
      orderId: 'gas-sponsor-order',
      userOrderId: 'user-order-1',
      accountLabel: 'funding_operator',
      userId: 'user-1',
      intentId: 'intent-amm',
      gasAssetId: 'asset-eth',
      estimatedGasCost: '0.02',
      reason: 'gas_debit_settled',
    });

    expect(balanceLedgerService.unlockFunds).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ledger-order-1',
        assetId: 'asset-usdc',
        amount: '0.5',
        idempotencyKey:
          'amm-swap-reserve-release:intent-amm:asset-usdc:amm_swap_settled',
      }),
    );
    expect(balanceLedgerService.unlockFunds).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'gas-sponsor-order',
        assetId: 'asset-eth',
        amount: '0.5',
        idempotencyKey:
          'gas-reserve-release:intent-amm:asset-eth:gas_debit_settled',
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
      idempotencyKey:
        'reserve-release:order-1:intent-1:exchange_create_failed',
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
        'reserve-release:order-1:exchange-order-1:exchange_order_cancelled',
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
        'reserve-release:order-1:exchange-order-1:exchange_order_cancelled',
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

  it('scopes terminal release idempotency keys by order', async () => {
    const service = new OrderReservationService(balanceLedgerService as any);

    balanceLedgerService.getExistingBalance.mockResolvedValue({
      locked: '25',
    });

    await service.releaseRemainingLimitOrderReservation({
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
    await service.releaseRemainingLimitOrderReservation({
      orderId: 'order-2',
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

    expect(balanceLedgerService.unlockFunds).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderId: 'order-1',
        idempotencyKey:
          'reserve-release:order-1:exchange-order-1:exchange_order_cancelled',
      }),
    );
    expect(balanceLedgerService.unlockFunds).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderId: 'order-2',
        idempotencyKey:
          'reserve-release:order-2:exchange-order-1:exchange_order_cancelled',
      }),
    );
  });

  it('does not re-release a terminal exchange order that already has a ledger release', async () => {
    const service = new OrderReservationService(
      balanceLedgerService as any,
      ledgerEntryRepository as any,
    );

    ledgerEntryRepository.findOneBy.mockResolvedValue({
      amount: '1.0556',
      idempotencyKey:
        'reserve-release:order-1:exchange-order-1:exchange_order_cancelled',
    });
    balanceLedgerService.getExistingBalance.mockResolvedValue({
      locked: '10',
    });

    const result = await service.releaseRemainingLimitOrderReservation({
      orderId: 'order-1',
      userId: 'user-1',
      intentId: 'intent-cancel',
      releaseId: 'exchange-order-1',
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      qty: '0.2',
      filledQty: '0.1',
      reason: 'exchange_order_cancelled',
    });

    expect(ledgerEntryRepository.findOneBy).toHaveBeenCalledWith({
      idempotencyKey:
        'reserve-release:order-1:exchange-order-1:exchange_order_cancelled',
    });
    expect(balanceLedgerService.getExistingBalance).not.toHaveBeenCalled();
    expect(balanceLedgerService.unlockFunds).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      orderId: 'order-1',
      assetId: 'USDT',
      amount: '1.0556',
      applied: false,
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
      idempotencyKey: expect.stringMatching(
        /^reservation-recovery:order-1:USDT:[a-f0-9]{16}$/,
      ),
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
      idempotencyKey: expect.stringMatching(
        /^reservation-recovery:order-1:USDT:[a-f0-9]{16}$/,
      ),
      refType: 'reservation_recovery',
      refId: 'order-1',
    });
  });

  it('uses different recovery keys when the residual amount changes', async () => {
    const service = new OrderReservationService(
      balanceLedgerService as any,
      ledgerEntryRepository as any,
    );

    ledgerEntryRepository.find
      .mockResolvedValueOnce([
        {
          orderId: 'order-1',
          userId: 'user-1',
          assetId: 'USDT',
          amount: '100',
          type: 'reserve_lock',
          refId: 'intent-1',
        },
      ])
      .mockResolvedValueOnce([
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
        },
      ]);

    await service.recoverDanglingReservationsForOrder({
      orderId: 'order-1',
      liveIntentIds: [],
      hasOpenOrder: false,
    });
    await service.recoverDanglingReservationsForOrder({
      orderId: 'order-1',
      liveIntentIds: [],
      hasOpenOrder: false,
    });

    const firstKey = balanceLedgerService.unlockFunds.mock.calls[0][0]
      .idempotencyKey;
    const secondKey = balanceLedgerService.unlockFunds.mock.calls[1][0]
      .idempotencyKey;

    expect(balanceLedgerService.unlockFunds).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        amount: '100',
        idempotencyKey: expect.stringMatching(
          /^reservation-recovery:order-1:USDT:[a-f0-9]{16}$/,
        ),
      }),
    );
    expect(balanceLedgerService.unlockFunds).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        amount: '75',
        idempotencyKey: expect.stringMatching(
          /^reservation-recovery:order-1:USDT:[a-f0-9]{16}$/,
        ),
      }),
    );
    expect(firstKey).not.toBe(secondKey);
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
