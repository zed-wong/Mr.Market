import { FillSettlementService } from './fill-settlement.service';

describe('FillSettlementService', () => {
  const balanceLedgerService = {
    adjust: jest.fn().mockResolvedValue({ applied: true }),
    debitFee: jest.fn().mockResolvedValue({ applied: true }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    balanceLedgerService.adjust.mockResolvedValue({ applied: true });
    balanceLedgerService.debitFee.mockResolvedValue({ applied: true });
  });

  it('settles fill base and quote movement through the order-scoped ledger', async () => {
    const service = new FillSettlementService(balanceLedgerService as any);

    await expect(
      service.settleFill({
        strategyKey: 'strategy-1',
        orderId: 'order-1',
        userId: 'user-1',
        pair: 'BTC/USDT',
        fill: {
          exchangeOrderId: 'ex-1',
          clientOrderId: 'order-1:0',
          side: 'buy',
          price: '100',
          qty: '0.5',
          cumulativeQty: '0.5',
        },
      }),
    ).resolves.toBe(true);

    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(1, {
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '-50',
      idempotencyKey: 'mm-fill:strategy-1:order-1:default:ex-1:buy:0.5:quote',
      refType: 'market_making_fill',
      refId: 'ex-1',
    });
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(2, {
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'BTC',
      amount: '0.5',
      idempotencyKey: 'mm-fill:strategy-1:order-1:default:ex-1:buy:0.5:base',
      refType: 'market_making_fill',
      refId: 'ex-1',
    });
  });

  it('does not credit bought base when quote settlement fails first', async () => {
    const service = new FillSettlementService(balanceLedgerService as any);

    balanceLedgerService.adjust.mockRejectedValueOnce(
      new Error('insufficient locked balance for fill settlement'),
    );

    await expect(
      service.settleFill({
        strategyKey: 'strategy-1',
        orderId: 'order-1',
        userId: 'user-1',
        pair: 'BTC/USDT',
        fill: {
          exchangeOrderId: 'ex-1',
          clientOrderId: 'order-1:0',
          side: 'buy',
          price: '100',
          qty: '0.5',
          cumulativeQty: '0.5',
        },
      }),
    ).rejects.toThrow('insufficient locked balance for fill settlement');

    expect(balanceLedgerService.adjust).toHaveBeenCalledTimes(1);
    expect(balanceLedgerService.adjust).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'USDT',
        amount: '-50',
        idempotencyKey: 'mm-fill:strategy-1:order-1:default:ex-1:buy:0.5:quote',
      }),
    );
  });

  it('settles actual fill fees through fee_debit when present', async () => {
    const service = new FillSettlementService(balanceLedgerService as any);

    await service.settleFill({
      strategyKey: 'strategy-1',
      orderId: 'order-1',
      userId: 'user-1',
      pair: 'BTC/USDT',
      fill: {
        exchangeOrderId: 'ex-1',
        fillId: 'fill-1',
        side: 'buy',
        price: '100',
        qty: '0.5',
        cumulativeQty: '0.5',
        feeAmount: '0.0005',
        feeAsset: 'BTC',
      },
    });

    expect(balanceLedgerService.debitFee).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'BTC',
      amount: '0.0005',
      idempotencyKey: 'mm-fill:strategy-1:order-1:default:ex-1:buy:0.5:fee:BTC',
      refType: 'market_making_fee',
      refId: 'ex-1',
    });
    expect(balanceLedgerService.debitFee).toHaveBeenCalledTimes(1);
  });

  it('records an estimated maker quote fee when exchange fill omits actual fee details', async () => {
    const exchangeInitService = {
      getExchange: jest.fn().mockReturnValue({
        markets: {
          'BTC/USDT': {
            maker: 0.0002,
            taker: 0.0005,
          },
        },
      }),
    };
    const service = new FillSettlementService(
      balanceLedgerService as any,
      undefined,
      exchangeInitService as any,
    );

    await service.settleFill({
      strategyKey: 'strategy-1',
      orderId: 'order-1',
      userId: 'user-1',
      exchangeName: 'mexc',
      pair: 'BTC/USDT',
      fill: {
        exchangeOrderId: 'ex-1',
        accountLabel: '4',
        role: 'maker',
        side: 'buy',
        price: '100',
        qty: '0.5',
        cumulativeQty: '0.5',
      },
    });

    expect(balanceLedgerService.debitFee).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '0.01',
      idempotencyKey:
        'mm-fill:strategy-1:order-1:4:ex-1:buy:0.5:estimated-fee:USDT',
      refType: 'market_making_estimated_fee',
      refId: 'ex-1',
    });
  });

  it('records an estimated taker quote fee when the fill role is taker', async () => {
    const exchangeInitService = {
      getExchange: jest.fn().mockReturnValue({
        markets: {
          'BTC/USDT': {
            maker: 0.0002,
            taker: 0.0005,
          },
        },
      }),
    };
    const service = new FillSettlementService(
      balanceLedgerService as any,
      undefined,
      exchangeInitService as any,
    );

    await service.settleFill({
      strategyKey: 'strategy-1',
      orderId: 'order-1',
      userId: 'user-1',
      exchangeName: 'mexc',
      pair: 'BTC/USDT',
      fill: {
        exchangeOrderId: 'ex-1',
        accountLabel: '8',
        role: 'taker',
        side: 'sell',
        price: '100',
        qty: '0.5',
        cumulativeQty: '0.5',
      },
    });

    expect(balanceLedgerService.debitFee).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '0.025',
      idempotencyKey:
        'mm-fill:strategy-1:order-1:8:ex-1:sell:0.5:estimated-fee:USDT',
      refType: 'market_making_estimated_fee',
      refId: 'ex-1',
    });
  });

  it('uses the higher fee rate when fill role is missing', async () => {
    const exchangeInitService = {
      getExchange: jest.fn().mockReturnValue({
        markets: {
          'BTC/USDT': {
            maker: 0.0002,
            taker: 0.0005,
          },
        },
      }),
    };
    const service = new FillSettlementService(
      balanceLedgerService as any,
      undefined,
      exchangeInitService as any,
    );

    await service.settleFill({
      strategyKey: 'strategy-1',
      orderId: 'order-1',
      userId: 'user-1',
      exchangeName: 'mexc',
      pair: 'BTC/USDT',
      fill: {
        exchangeOrderId: 'ex-1',
        side: 'buy',
        price: '100',
        qty: '0.5',
        cumulativeQty: '0.5',
      },
    });

    expect(balanceLedgerService.debitFee).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'USDT',
        amount: '0.025',
        refType: 'market_making_estimated_fee',
      }),
    );
  });

  it('uses cumulative order progress before fill id for cross-source idempotency', async () => {
    const service = new FillSettlementService(balanceLedgerService as any);

    await service.settleFill({
      strategyKey: 'strategy-1',
      orderId: 'order-1',
      userId: 'user-1',
      pair: 'BTC/USDT',
      fill: {
        exchangeOrderId: 'ex-1',
        fillId: 'fill-1',
        side: 'buy',
        price: '100',
        qty: '0.5',
        cumulativeQty: '0.5',
      },
    });
    await service.settleFill({
      strategyKey: 'strategy-1',
      orderId: 'order-1',
      userId: 'user-1',
      pair: 'BTC/USDT',
      fill: {
        exchangeOrderId: 'ex-1',
        clientOrderId: 'client-1',
        side: 'buy',
        price: '100',
        qty: '0.5',
        cumulativeQty: '0.5',
      },
    });

    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        idempotencyKey: 'mm-fill:strategy-1:order-1:default:ex-1:buy:0.5:quote',
      }),
    );
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        idempotencyKey: 'mm-fill:strategy-1:order-1:default:ex-1:buy:0.5:quote',
      }),
    );
  });

  it('does not throw when actual fill fee debit requires manual review', async () => {
    const service = new FillSettlementService(balanceLedgerService as any);
    const logger = Reflect.get(service, 'logger') as {
      warn: jest.Mock | ((message: string) => void);
    };
    const warnSpy = jest
      .spyOn(logger, 'warn')
      .mockImplementation(() => undefined);

    balanceLedgerService.debitFee.mockRejectedValue(
      new Error('insufficient available balance'),
    );

    await expect(
      service.settleFill({
        strategyKey: 'strategy-1',
        orderId: 'order-1',
        userId: 'user-1',
        pair: 'BTC/USDT',
        fill: {
          exchangeOrderId: 'ex-1',
          fillId: 'fill-1',
          side: 'buy',
          price: '100',
          qty: '0.5',
          cumulativeQty: '0.5',
          feeAmount: '0.0005',
          feeAsset: 'BTC',
        },
      }),
    ).resolves.toBe(true);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Fill fee debit requires manual review'),
    );
  });

  it('caps an unmatched first settlement delta at cumulative quantity', async () => {
    const service = new FillSettlementService(balanceLedgerService as any);

    const settlementFill = service.buildIncrementalSettlementFill(undefined, {
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '53.35',
      qty: '0.334',
      cumulativeQty: '0.138',
    });

    expect(settlementFill).toEqual(
      expect.objectContaining({
        qty: '0.138',
        cumulativeQty: '0.138',
      }),
    );

    await expect(
      service.settleFill({
        strategyKey: 'strategy-1',
        orderId: 'order-1',
        userId: 'user-1',
        pair: 'XIN/USDT',
        fill: settlementFill!,
      }),
    ).resolves.toBe(true);

    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(1, {
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '-7.3623',
      idempotencyKey:
        'mm-fill:strategy-1:order-1:default:ex-1:buy:0.138:quote',
      refType: 'market_making_fill',
      refId: 'ex-1',
    });
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(2, {
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'XIN',
      amount: '0.138',
      idempotencyKey:
        'mm-fill:strategy-1:order-1:default:ex-1:buy:0.138:base',
      refType: 'market_making_fill',
      refId: 'ex-1',
    });
  });

  it('keeps explicit delta quantity when it is below cumulative quantity', () => {
    const service = new FillSettlementService(balanceLedgerService as any);

    const settlementFill = service.buildIncrementalSettlementFill(undefined, {
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '0.5',
      cumulativeQty: '1.5',
    });

    expect(settlementFill).toEqual(
      expect.objectContaining({
        qty: '0.5',
        cumulativeQty: '1.5',
      }),
    );
  });
});
